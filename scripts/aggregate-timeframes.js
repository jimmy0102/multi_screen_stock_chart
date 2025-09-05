#!/usr/bin/env node

require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 日付の週番号を取得
function getWeekNumber(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// 月の開始日を取得（標準: 毎月1日）
function getMonthStart(date) {
  const d = new Date(date + 'T00:00:00.000Z') // UTCで解析
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().split('T')[0]
}

// 週の開始日を取得（TradingView標準: 日曜日開始）
function getWeekStart(date) {
  const d = new Date(date + 'T00:00:00.000Z') // UTCで解析してタイムゾーン問題を回避
  const day = d.getUTCDay()
  // 日曜日を週の開始とする（TradingView標準）
  const diff = -day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

// 日足データを週足に集約
async function aggregateWeeklyData(ticker, year) {
  console.log(`📊 Aggregating weekly data for ${ticker} (${year})...`)
  
  // その年の日足データを取得
  const { data: dailyData, error } = await supabase
    .from('stock_prices')
    .select('*')
    .eq('ticker', ticker)
    .eq('timeframe', '1D')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true })
  
  if (error) {
    console.error(`Error fetching daily data for ${ticker}:`, error)
    return []
  }
  
  if (!dailyData || dailyData.length === 0) {
    return []
  }
  
  // 週ごとにグループ化
  const weeklyGroups = {}
  
  dailyData.forEach(day => {
    const weekStart = getWeekStart(day.date)
    
    if (!weeklyGroups[weekStart]) {
      weeklyGroups[weekStart] = []
    }
    weeklyGroups[weekStart].push(day)
  })
  
  // 週足データを生成
  const weeklyData = []
  
  Object.entries(weeklyGroups).forEach(([weekStart, days]) => {
    if (days.length === 0) return
    
    // 時系列順にソート（重要: TradingView標準）
    days.sort((a, b) => new Date(a.date) - new Date(b.date))
    
    // 週の最初と最後の取引日を取得
    const firstDay = days[0]
    const lastDay = days[days.length - 1]
    
    // OHLC計算（標準的な方法）
    const open = firstDay.open    // 期間最初の始値
    const close = lastDay.close   // 期間最後の終値
    const high = Math.max(...days.map(d => d.high))  // 期間最高値
    const low = Math.min(...days.filter(d => d.low > 0).map(d => d.low))  // 期間最安値（0除外）
    const volume = days.reduce((sum, d) => sum + (d.volume || 0), 0)  // 期間合計出来高
    
    weeklyData.push({
      ticker,
      date: weekStart, // 週の開始日
      timeframe: '1W',
      open,
      high,
      low,
      close,
      volume
    })
  })
  
  return weeklyData
}

// 日足データを月足に集約
async function aggregateMonthlyData(ticker, year) {
  console.log(`📊 Aggregating monthly data for ${ticker} (${year})...`)
  
  // その年の日足データを取得
  const { data: dailyData, error } = await supabase
    .from('stock_prices')
    .select('*')
    .eq('ticker', ticker)
    .eq('timeframe', '1D')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true })
  
  if (error) {
    console.error(`Error fetching daily data for ${ticker}:`, error)
    return []
  }
  
  if (!dailyData || dailyData.length === 0) {
    return []
  }
  
  // 月ごとにグループ化
  const monthlyGroups = {}
  
  dailyData.forEach(day => {
    const monthStart = getMonthStart(day.date)
    
    if (!monthlyGroups[monthStart]) {
      monthlyGroups[monthStart] = []
    }
    monthlyGroups[monthStart].push(day)
  })
  
  // 月足データを生成
  const monthlyData = []
  
  Object.entries(monthlyGroups).forEach(([monthStart, days]) => {
    if (days.length === 0) return
    
    // 時系列順にソート（重要: TradingView標準）
    days.sort((a, b) => new Date(a.date) - new Date(b.date))
    
    // 月の最初と最後の取引日を取得
    const firstDay = days[0]
    const lastDay = days[days.length - 1]
    
    // OHLC計算（標準的な方法）
    const open = firstDay.open    // 期間最初の始値
    const close = lastDay.close   // 期間最後の終値
    const high = Math.max(...days.map(d => d.high))  // 期間最高値
    const low = Math.min(...days.filter(d => d.low > 0).map(d => d.low))  // 期間最安値（0除外）
    const volume = days.reduce((sum, d) => sum + (d.volume || 0), 0)  // 期間合計出来高
    
    monthlyData.push({
      ticker,
      date: monthStart, // 月の開始日
      timeframe: '1M',
      open,
      high,
      low,
      close,
      volume
    })
  })
  
  return monthlyData
}

// データを保存
async function saveAggregatedData(data, timeframe) {
  if (!data || data.length === 0) return false
  
  try {
    const { error } = await supabase
      .from('stock_prices')
      .upsert(data, { 
        onConflict: 'ticker,date,timeframe',
        ignoreDuplicates: true 
      })
    
    if (error) {
      console.error(`Error saving ${timeframe} data:`, error)
      return false
    }
    
    console.log(`✅ Saved ${data.length} ${timeframe} records`)
    return true
  } catch (error) {
    console.error(`Save error for ${timeframe}:`, error)
    return false
  }
}

// 全銘柄の一覧を取得（Supabaseの1000件制限を考慮）
async function getAllTickers() {
  try {
    console.log('📋 Fetching all unique tickers (this may take a few minutes)...')
    const uniqueTickers = new Set()
    let offset = 0
    const batchSize = 1000 // Supabaseの最大値
    let processedCount = 0
    
    while (processedCount < 2000000) { // 約200万レコード
      const { data, error } = await supabase
        .from('stock_prices')
        .select('ticker')
        .eq('timeframe', '1D')
        .order('ticker', { ascending: true })
        .range(offset, offset + batchSize - 1)
      
      if (error) {
        console.error('Error fetching tickers:', error)
        break
      }
      
      if (!data || data.length === 0) {
        break
      }
      
      // ユニークな銘柄を追加
      data.forEach(item => uniqueTickers.add(item.ticker))
      
      processedCount += data.length
      offset += batchSize
      
      // 進捗表示（10万件ごと）
      if (processedCount % 100000 === 0) {
        console.log(`  Processed ${processedCount.toLocaleString()} records... ${uniqueTickers.size} unique tickers found`)
      }
      
      if (data.length < batchSize) {
        break
      }
    }
    
    const tickersArray = Array.from(uniqueTickers).sort()
    console.log(`📋 Found ${tickersArray.length} unique tickers`)
    return tickersArray
  } catch (error) {
    console.error('Error in getAllTickers:', error)
    return []
  }
}

// メイン処理
async function main() {
  console.log('🚀 Starting timeframe aggregation...')
  
  // 集約対象年度（過去5年）
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  console.log(`📅 Processing years: ${years.join(', ')}`)
  
  // 全銘柄取得
  const tickers = await getAllTickers()
  if (tickers.length === 0) {
    console.error('No tickers found')
    process.exit(1)
  }
  
  let totalWeekly = 0
  let totalMonthly = 0
  
  // 各銘柄・各年度を処理
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    console.log(`\n[${i + 1}/${tickers.length}] Processing ${ticker}...`)
    
    for (const year of years) {
      try {
        // 週足データ集約
        const weeklyData = await aggregateWeeklyData(ticker, year)
        if (weeklyData.length > 0) {
          await saveAggregatedData(weeklyData, '1W')
          totalWeekly += weeklyData.length
        }
        
        // 月足データ集約
        const monthlyData = await aggregateMonthlyData(ticker, year)
        if (monthlyData.length > 0) {
          await saveAggregatedData(monthlyData, '1M')
          totalMonthly += monthlyData.length
        }
        
        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Error processing ${ticker} (${year}):`, error.message)
      }
    }
    
    // 進捗表示
    if ((i + 1) % 50 === 0) {
      console.log(`📊 Progress: ${i + 1}/${tickers.length} tickers processed`)
      console.log(`📈 Weekly records: ${totalWeekly}, Monthly records: ${totalMonthly}`)
    }
  }
  
  console.log('\n🎉 Timeframe aggregation completed!')
  console.log(`📊 Total weekly records: ${totalWeekly}`)
  console.log(`📊 Total monthly records: ${totalMonthly}`)
}

// 実行
main().catch(error => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})