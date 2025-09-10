#!/usr/bin/env node

// 週足・月足データの更新スクリプト（JST対応・0価格除外版）
const { SupabaseHelper, dateUtils, calculateOHLC } = require('./utils')

class TimeframeUpdater {
  constructor() {
    this.supabase = new SupabaseHelper()
  }

  async calculateWeeklyData(ticker, weekStart) {
    try {
      // その週の日足データを取得
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const weekEndStr = weekEnd.toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, weekStart, weekEndStr)
      
      if (dailyData.length === 0) return null
      
      // 週足データ計算
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) return null
      
      // 週足データを返す（保存はしない）
      return {
        ticker,
        date: weekStart,
        timeframe: '1W',
        ...ohlc
      }
    } catch (error) {
      console.error(`Error calculating weekly data for ${ticker}:`, error.message)
      return null
    }
  }

  async calculateMonthlyData(ticker, monthStart) {
    try {
      // その月の日足データを取得
      const nextMonth = new Date(monthStart)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEnd = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, monthStart, monthEnd)
      
      if (dailyData.length === 0) return null
      
      // 月足データ計算
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) return null
      
      // 月足データを返す（保存はしない）
      return {
        ticker,
        date: monthStart,
        timeframe: '1M',
        ...ohlc
      }
    } catch (error) {
      console.error(`Error calculating monthly data for ${ticker}:`, error.message)
      return null
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
  
  // バッチ処理用の配列
  const weeklyRecords = []
  const monthlyRecords = []
  const lastWeekRecords = []
  const lastMonthRecords = []
  
  // 各銘柄の週足・月足を計算（バッチで保存するため）
  for (let i = 0; i < updatedTickers.length; i++) {
    const ticker = updatedTickers[i]
    
    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(`[${i + 1}/${updatedTickers.length}] Calculating ${ticker}...`)
    }
    
    // 1. 現在期間の計算（毎日実行）
    const weeklyData = await updater.calculateWeeklyData(ticker, currentWeekStart)
    if (weeklyData) {
      weeklyRecords.push(weeklyData)
    }
    
    const monthlyData = await updater.calculateMonthlyData(ticker, currentMonthStart)
    if (monthlyData) {
      monthlyRecords.push(monthlyData)
    }
    
    // 2. 完了期間の計算（特定の日のみ実行）
    if (isWeekFinalized) {
      const lastWeekStart = dateUtils.getLastWeekStart()
      const lastWeekData = await updater.calculateWeeklyData(ticker, lastWeekStart)
      if (lastWeekData) {
        lastWeekRecords.push(lastWeekData)
      }
    }
    
    if (isMonthFinalized) {
      const lastMonthStart = dateUtils.getLastMonthStart()
      const lastMonthData = await updater.calculateMonthlyData(ticker, lastMonthStart)
      if (lastMonthData) {
        lastMonthRecords.push(lastMonthData)
      }
    }
    
    // 進捗表示
    if ((i + 1) % 100 === 0) {
      console.log(`📊 Progress: ${i + 1}/${updatedTickers.length} tickers calculated`)
    }
  }
  
  // バッチで保存
  console.log('\n💾 Saving timeframe data in batches...')
  
  if (weeklyRecords.length > 0) {
    console.log(`📊 Saving ${weeklyRecords.length} weekly records...`)
    await supabase.saveStockData(weeklyRecords)
    weeklyUpdated = weeklyRecords.length
  }
  
  if (monthlyRecords.length > 0) {
    console.log(`📊 Saving ${monthlyRecords.length} monthly records...`)
    await supabase.saveStockData(monthlyRecords)
    monthlyUpdated = monthlyRecords.length
  }
  
  if (lastWeekRecords.length > 0) {
    console.log(`📊 Saving ${lastWeekRecords.length} last week records...`)
    await supabase.saveStockData(lastWeekRecords)
    lastWeekFinalized = lastWeekRecords.length
  }
  
  if (lastMonthRecords.length > 0) {
    console.log(`📊 Saving ${lastMonthRecords.length} last month records...`)
    await supabase.saveStockData(lastMonthRecords)
    lastMonthFinalized = lastMonthRecords.length
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