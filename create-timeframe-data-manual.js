#!/usr/bin/env node

// 手動で日付範囲を指定して週足・月足データを作成するスクリプト
// 使用例: FROM_DATE=2025-09-01 TO_DATE=2025-09-05 node create-timeframe-data-manual.js

const { SupabaseHelper, calculateOHLC } = require('./scripts/utils')

class ManualTimeframeCreator {
  constructor() {
    this.supabase = new SupabaseHelper()
  }

  async createWeeklyData(ticker, weekStart) {
    try {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const weekEndStr = weekEnd.toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, weekStart, weekEndStr)
      
      if (dailyData.length === 0) {
        return null
      }
      
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) {
        return null
      }
      
      return {
        ticker,
        date: weekStart,
        timeframe: '1W',
        ...ohlc,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error(`❌ Error calculating weekly data for ${ticker}:`, error.message)
      return null
    }
  }

  async createMonthlyData(ticker, monthStart) {
    try {
      const nextMonth = new Date(monthStart)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEndStr = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0]
      
      const dailyData = await this.supabase.getDailyDataForPeriod(ticker, monthStart, monthEndStr)
      
      if (dailyData.length === 0) {
        return null
      }
      
      const ohlc = calculateOHLC(dailyData)
      if (!ohlc) {
        return null
      }
      
      return {
        ticker,
        date: monthStart,
        timeframe: '1M',
        ...ohlc,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error(`❌ Error calculating monthly data for ${ticker}:`, error.message)
      return null
    }
  }
}

// 週の開始日を取得（指定日を含む週の日曜日）
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  return sunday.toISOString().split('T')[0]
}

// 月の開始日を取得
function getMonthStart(date) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

async function main() {
  const fromDate = process.env.FROM_DATE
  const toDate = process.env.TO_DATE
  
  if (!fromDate || !toDate) {
    console.error('❌ FROM_DATE and TO_DATE environment variables are required')
    console.error('Usage: FROM_DATE=2025-09-01 TO_DATE=2025-09-05 node create-timeframe-data-manual.js')
    process.exit(1)
  }
  
  console.log(`🚀 Creating weekly and monthly data for date range: ${fromDate} to ${toDate}`)
  
  const weekStart = getWeekStart(fromDate)
  const monthStart = getMonthStart(fromDate)
  
  console.log(`📅 Week start: ${weekStart}`)
  console.log(`📅 Month start: ${monthStart}`)
  
  const creator = new ManualTimeframeCreator()
  
  // 指定期間のデータがある銘柄を取得
  console.log('📋 Fetching tickers with data in the specified period...')
  const allTickers = await creator.supabase.getUpdatedTickers(toDate)
  
  if (allTickers.length === 0) {
    console.log('❌ No tickers found!')
    return
  }
  
  console.log(`📈 Processing ${allTickers.length} tickers...`)
  
  const weeklyRecords = []
  const monthlyRecords = []
  
  for (let i = 0; i < allTickers.length; i++) {
    const ticker = allTickers[i]
    
    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(`[${i + 1}/${allTickers.length}] Processing ${ticker}...`)
    }
    
    // 週足データ作成
    const weeklyData = await creator.createWeeklyData(ticker, weekStart)
    if (weeklyData) {
      weeklyRecords.push(weeklyData)
    }
    
    // 月足データ作成
    const monthlyData = await creator.createMonthlyData(ticker, monthStart)
    if (monthlyData) {
      monthlyRecords.push(monthlyData)
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`📊 Progress: ${i + 1}/${allTickers.length} tickers processed`)
      console.log(`📊 Weekly records so far: ${weeklyRecords.length}`)
      console.log(`📊 Monthly records so far: ${monthlyRecords.length}`)
    }
  }
  
  console.log('\n💾 Saving data in batches...')
  
  // 週足データ保存
  if (weeklyRecords.length > 0) {
    console.log(`📊 Saving ${weeklyRecords.length} weekly records...`)
    const success = await creator.supabase.saveStockData(weeklyRecords)
    if (success) {
      console.log(`✅ Successfully saved ${weeklyRecords.length} weekly records`)
    } else {
      console.log(`❌ Failed to save weekly records`)
    }
  }
  
  // 月足データ保存
  if (monthlyRecords.length > 0) {
    console.log(`📊 Saving ${monthlyRecords.length} monthly records...`)
    const success = await creator.supabase.saveStockData(monthlyRecords)
    if (success) {
      console.log(`✅ Successfully saved ${monthlyRecords.length} monthly records`)
    } else {
      console.log(`❌ Failed to save monthly records`)
    }
  }
  
  console.log('\n🎉 Manual timeframe data creation completed!')
  console.log(`📊 Weekly records created: ${weeklyRecords.length}`)
  console.log(`📊 Monthly records created: ${monthlyRecords.length}`)
  console.log(`📈 Total tickers processed: ${allTickers.length}`)
  
  // サンプルデータ表示
  if (weeklyRecords.length > 0) {
    console.log('\n📋 Sample weekly record:')
    const sample = weeklyRecords[0]
    console.log(`  Ticker: ${sample.ticker}`)
    console.log(`  Date: ${sample.date}`)
    console.log(`  Open: ${sample.open}`)
    console.log(`  High: ${sample.high}`)
    console.log(`  Low: ${sample.low}`)
    console.log(`  Close: ${sample.close}`)
    console.log(`  Volume: ${sample.volume}`)
  }
}

main().catch(console.error)