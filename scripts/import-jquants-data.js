#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const JQUANTS_EMAIL = process.env.JQUANTS_EMAIL
const JQUANTS_PASSWORD = process.env.JQUANTS_PASSWORD

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials')
  console.error('SUPABASE_URL:', !!SUPABASE_URL)
  console.error('SUPABASE_SERVICE_KEY:', !!SUPABASE_SERVICE_KEY)
  process.exit(1)
}

// Initialize Supabase with service key for admin access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Popular Japanese stock tickers
const DEFAULT_TICKERS = [
  { symbol: '7203', name: 'トヨタ自動車', market: 'TSE', sector: '自動車' },
  { symbol: '9983', name: 'ファーストリテイリング', market: 'TSE', sector: '小売' },
  { symbol: '6758', name: 'ソニーグループ', market: 'TSE', sector: '電機' },
  { symbol: '9984', name: 'ソフトバンクグループ', market: 'TSE', sector: '通信' },
  { symbol: '6861', name: 'キーエンス', market: 'TSE', sector: '電機' },
  { symbol: '4063', name: '信越化学工業', market: 'TSE', sector: '化学' },
  { symbol: '9432', name: '日本電信電話', market: 'TSE', sector: '通信' },
  { symbol: '6098', name: 'リクルートホールディングス', market: 'TSE', sector: 'サービス' },
  { symbol: '8035', name: '東京エレクトロン', market: 'TSE', sector: '電機' },
  { symbol: '4519', name: '中外製薬', market: 'TSE', sector: '医薬品' }
]

// Generate sample OHLCV data
function generateSampleData(ticker, days = 365) {
  const data = []
  const now = new Date()
  let basePrice = 10000 + Math.random() * 50000 // Random base price between 10,000 and 60,000
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue
    
    // Generate realistic price movement
    const change = (Math.random() - 0.48) * 0.03 // Slight upward bias
    basePrice = basePrice * (1 + change)
    
    const open = basePrice * (1 + (Math.random() - 0.5) * 0.01)
    const close = basePrice * (1 + (Math.random() - 0.5) * 0.01)
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)
    const volume = Math.floor(1000000 + Math.random() * 10000000)
    
    data.push({
      ticker: ticker.symbol,
      date: date.toISOString().split('T')[0],
      timeframe: '1D',
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume
    })
  }
  
  return data
}

async function importData() {
  console.log('🚀 Starting data import...')
  
  try {
    // 1. Insert ticker master data
    console.log('📊 Importing ticker master data...')
    const { error: tickerError } = await supabase
      .from('ticker_master')
      .upsert(DEFAULT_TICKERS, { onConflict: 'symbol' })
    
    if (tickerError) {
      console.error('Error importing ticker master:', tickerError)
      return
    }
    
    console.log(`✅ Imported ${DEFAULT_TICKERS.length} tickers`)
    
    // 2. Generate and import price data
    console.log('💹 Generating and importing price data...')
    
    for (const ticker of DEFAULT_TICKERS) {
      const priceData = generateSampleData(ticker)
      
      // Insert in batches of 100
      const batchSize = 100
      for (let i = 0; i < priceData.length; i += batchSize) {
        const batch = priceData.slice(i, i + batchSize)
        
        const { error: priceError } = await supabase
          .from('stock_prices')
          .upsert(batch, { 
            onConflict: 'ticker,date,timeframe',
            ignoreDuplicates: true 
          })
        
        if (priceError) {
          console.error(`Error importing prices for ${ticker.symbol}:`, priceError)
          continue
        }
      }
      
      console.log(`✅ Imported ${priceData.length} days of data for ${ticker.symbol} - ${ticker.name}`)
    }
    
    // 3. Verify import
    const { count } = await supabase
      .from('stock_prices')
      .select('*', { count: 'exact', head: true })
    
    console.log(`\n🎉 Import complete! Total price records: ${count}`)
    console.log('You can now view the charts in your application.')
    
  } catch (error) {
    console.error('Import failed:', error)
    process.exit(1)
  }
}

// Run import
importData()