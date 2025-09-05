// 手動でSupabase接続をテスト
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

console.log('Testing Supabase connection...')
console.log('URL:', SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'MISSING')
console.log('Key:', SUPABASE_ANON_KEY ? 'SET' : 'MISSING')

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testConnection() {
  try {
    console.log('\n1. Testing basic connection...')
    const { data: health, error: healthError } = await supabase
      .from('ticker_master')
      .select('count')
      .limit(1)
    
    console.log('Health check result:', { health, healthError })
    
    console.log('\n2. Getting ticker count...')
    const { count, error: countError } = await supabase
      .from('ticker_master')
      .select('*', { count: 'exact', head: true })
    
    console.log('Ticker count result:', { count, countError })
    
    console.log('\n3. Getting actual tickers...')
    const { data: tickers, error: tickerError } = await supabase
      .from('ticker_master')
      .select('*')
      .limit(5)
    
    console.log('Tickers result:', { 
      tickerCount: tickers?.length || 0, 
      firstTicker: tickers?.[0],
      tickerError 
    })
    
    console.log('\n4. Getting stock prices count...')
    const { count: priceCount, error: priceCountError } = await supabase
      .from('stock_prices')
      .select('*', { count: 'exact', head: true })
    
    console.log('Stock prices count:', { priceCount, priceCountError })
    
  } catch (error) {
    console.error('Connection test failed:', error)
  }
}

testConnection()