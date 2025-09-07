#!/usr/bin/env node

const { SupabaseHelper, dateUtils, calculateOHLC } = require('./utils')

class TimeframeUpdater {
  constructor() {
    this.supabase = new SupabaseHelper()
  }

  async updateWeeklyData(ticker, weekStart) {
    try {
      // その週の日足データを取得
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const weekEndStr = weekEnd.toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, weekStart, weekEndStr)
      
      if (dailyData.length === 0) return false
      
      // 週足データ計算
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) return false
      
      // 週足データを保存
      const weeklyRecord = {
        ticker,
        date: weekStart,
        timeframe: '1W',
        ...ohlc
      }
      
      return await this.supabase.saveStockData([weeklyRecord])
    } catch (error) {
      console.error(`Error updating weekly data for ${ticker}:`, error.message)
      return false
    }
  }

  async updateMonthlyData(ticker, monthStart) {
    try {
      // その月の日足データを取得
      const nextMonth = new Date(monthStart)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEnd = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, monthStart, monthEnd)
      
      if (dailyData.length === 0) return false
      
      // 月足データ計算
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) return false
      
      // 月足データを保存
      const monthlyRecord = {
        ticker,
        date: monthStart,
        timeframe: '1M',
        ...ohlc
      }
      
      return await this.supabase.saveStockData([monthlyRecord])
    } catch (error) {
      console.error(`Error updating monthly data for ${ticker}:`, error.message)
      return false
    }
  }
}

async function main() {
  console.log('🚀 Starting daily timeframe update...')
  
  // TARGET_DATE環境変数があればそれを使用、なければ昨日の日付を使用
  const targetDate = process.env.TARGET_DATE || dateUtils.getYesterday()
  const currentWeekStart = dateUtils.getCurrentWeekStart()
  const currentMonthStart = dateUtils.getCurrentMonthStart()
  const isWeekFinalized = dateUtils.isSaturday()
  const isMonthFinalized = dateUtils.isFirstOfMonth()
  
  console.log(`📅 Target date: ${targetDate}`)
  console.log(`📅 Current week start: ${currentWeekStart}`)
  console.log(`📅 Current month start: ${currentMonthStart}`)
  
  if (isWeekFinalized) {
    console.log('🎯 WEEK FINALIZATION DAY: Today is Saturday - last week data will be finalized!')
  }
  if (isMonthFinalized) {
    console.log('🎯 MONTH FINALIZATION DAY: Today is 1st of month - last month data will be finalized!')
  }
  
  const supabase = new SupabaseHelper()
  const updater = new TimeframeUpdater()
  
  // 昨日更新された銘柄を取得
  const updatedTickers = await supabase.getUpdatedTickers(targetDate)
  if (updatedTickers.length === 0) {
    console.log('⚠️  No tickers found for target date')
    return
  }
  
  let weeklyUpdated = 0
  let monthlyUpdated = 0
  let lastWeekFinalized = 0
  let lastMonthFinalized = 0
  
  console.log(`📈 Processing ${updatedTickers.length} tickers for timeframe updates...`)
  console.log('💡 Logic: Every day we update current periods + finalize completed periods')
  
  // 各銘柄の週足・月足を更新
  for (let i = 0; i < updatedTickers.length; i++) {
    const ticker = updatedTickers[i]
    
    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(`[${i + 1}/${updatedTickers.length}] Updating ${ticker}...`)
    }
    
    // 1. 現在期間の更新（毎日実行）
    if (await updater.updateWeeklyData(ticker, currentWeekStart)) {
      weeklyUpdated++
    }
    
    if (await updater.updateMonthlyData(ticker, currentMonthStart)) {
      monthlyUpdated++
    }
    
    // 2. 完了期間の確定（特定の日のみ実行）
    if (isWeekFinalized) {
      const lastWeekStart = dateUtils.getLastWeekStart()
      if (await updater.updateWeeklyData(ticker, lastWeekStart)) {
        lastWeekFinalized++
      }
    }
    
    if (isMonthFinalized) {
      const lastMonthStart = dateUtils.getLastMonthStart()
      if (await updater.updateMonthlyData(ticker, lastMonthStart)) {
        lastMonthFinalized++
      }
    }
    
    // 進捗表示
    if ((i + 1) % 100 === 0) {
      console.log(`📊 Progress: ${i + 1}/${updatedTickers.length} tickers processed`)
    }
  }
  
  console.log('\n🎉 Daily timeframe update completed!')
  console.log(`📊 Current week records updated: ${weeklyUpdated}`)
  console.log(`📊 Current month records updated: ${monthlyUpdated}`)
  
  if (isWeekFinalized) {
    console.log(`🎯 Last week records FINALIZED: ${lastWeekFinalized}`)
  }
  if (isMonthFinalized) {
    console.log(`🎯 Last month records FINALIZED: ${lastMonthFinalized}`)
  }
  
  console.log(`📈 Total tickers processed: ${updatedTickers.length}`)
  console.log('\n💡 Result: Current periods updated + completed periods finalized (if applicable)')
}

// 実行
main().catch(error => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})