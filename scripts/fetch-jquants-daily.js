#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const JQUANTS_EMAIL = process.env.JQUANTS_EMAIL
const JQUANTS_PASSWORD = process.env.JQUANTS_PASSWORD

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !JQUANTS_EMAIL || !JQUANTS_PASSWORD) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// J-Quants API設定
const JQUANTS_BASE_URL = 'https://api.jquants.com/v1'
let refreshToken = null
let accessToken = null

// J-Quantsにログインしてトークン取得
async function login() {
  console.log('🔐 Logging into J-Quants API...')
  try {
    const response = await axios.post(`${JQUANTS_BASE_URL}/token/auth_user`, {
      mailaddress: JQUANTS_EMAIL,
      password: JQUANTS_PASSWORD
    })
    
    refreshToken = response.data.refreshToken
    console.log('✅ J-Quants login successful')
    return true
  } catch (error) {
    console.error('❌ J-Quants login failed:', error.response?.data || error.message)
    return false
  }
}

// アクセストークン取得
async function getAccessToken() {
  if (!refreshToken) return false
  
  try {
    const response = await axios.post(`${JQUANTS_BASE_URL}/token/auth_refresh`, {
      refreshtoken: refreshToken
    })
    
    accessToken = response.data.accessToken
    console.log('✅ Access token obtained')
    return true
  } catch (error) {
    console.error('❌ Failed to get access token:', error.response?.data || error.message)
    return false
  }
}

// 銘柄リスト取得
async function getTickers() {
  try {
    const { data: existingTickers } = await supabase
      .from('ticker_master')
      .select('symbol')
    
    if (existingTickers && existingTickers.length > 0) {
      console.log(`📋 Using existing ${existingTickers.length} tickers from database`)
      return existingTickers.map(t => t.symbol)
    }
    
    // データベースに銘柄がない場合はデフォルト銘柄を使用
    const defaultTickers = [
      '7203', '9983', '6758', '9984', '6861', 
      '4063', '9432', '6098', '8035', '4519'
    ]
    console.log('📋 Using default tickers:', defaultTickers.join(', '))
    return defaultTickers
  } catch (error) {
    console.error('❌ Failed to get tickers:', error)
    return []
  }
}

// 株価データ取得
async function getStockData(ticker, date) {
  if (!accessToken) return null
  
  try {
    const response = await axios.get(`${JQUANTS_BASE_URL}/prices/daily_quotes`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      params: {
        code: ticker,
        date: date
      }
    })
    
    return response.data.daily_quotes || []
  } catch (error) {
    console.error(`❌ Failed to get stock data for ${ticker}:`, error.response?.data || error.message)
    return null
  }
}

// 前営業日を取得（土日を除く）
function getPreviousBusinessDay() {
  const today = new Date()
  let date = new Date(today)
  
  // 1日前から開始
  date.setDate(date.getDate() - 1)
  
  // 土日の場合は金曜日まで戻る
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1)
  }
  
  return date.toISOString().split('T')[0]
}

// Supabaseにデータ保存
async function saveToSupabase(stockData) {
  if (!stockData || stockData.length === 0) return false
  
  try {
    const { error } = await supabase
      .from('stock_prices')
      .upsert(stockData, { 
        onConflict: 'ticker,date,timeframe',
        ignoreDuplicates: true 
      })
    
    if (error) {
      console.error('❌ Failed to save to Supabase:', error)
      return false
    }
    
    console.log(`✅ Saved ${stockData.length} records to Supabase`)
    return true
  } catch (error) {
    console.error('❌ Supabase save error:', error)
    return false
  }
}

// メイン処理
async function main() {
  console.log('🚀 Starting J-Quants data fetch...')
  console.log('📅 Target date:', getPreviousBusinessDay())
  
  // 1. J-Quantsにログイン
  if (!(await login())) {
    process.exit(1)
  }
  
  // 2. アクセストークン取得
  if (!(await getAccessToken())) {
    process.exit(1)
  }
  
  // 3. 銘柄リスト取得
  const tickers = await getTickers()
  if (tickers.length === 0) {
    console.error('❌ No tickers found')
    process.exit(1)
  }
  
  // 4. 各銘柄の株価データ取得
  const targetDate = getPreviousBusinessDay()
  const allStockData = []
  
  for (const ticker of tickers) {
    console.log(`📈 Fetching data for ${ticker}...`)
    
    const stockData = await getStockData(ticker, targetDate)
    if (stockData && stockData.length > 0) {
      // データ形式をSupabase用に変換
      const convertedData = stockData.map(item => ({
        ticker: item.Code,
        date: item.Date,
        timeframe: '1D',
        open: parseFloat(item.Open) || 0,
        high: parseFloat(item.High) || 0,
        low: parseFloat(item.Low) || 0,
        close: parseFloat(item.Close) || 0,
        volume: parseInt(item.Volume) || 0
      }))
      
      allStockData.push(...convertedData)
      console.log(`✅ Got ${convertedData.length} records for ${ticker}`)
    } else {
      console.log(`⚠️  No data for ${ticker} on ${targetDate}`)
    }
    
    // API制限対策：リクエスト間隔を空ける
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // 5. Supabaseに保存
  if (allStockData.length > 0) {
    const success = await saveToSupabase(allStockData)
    if (success) {
      console.log('🎉 Data fetch completed successfully!')
      console.log(`📊 Total records processed: ${allStockData.length}`)
    } else {
      console.error('❌ Failed to save data')
      process.exit(1)
    }
  } else {
    console.log('⚠️  No data to save')
  }
}

// 実行
main().catch(error => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})