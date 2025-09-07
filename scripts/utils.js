#!/usr/bin/env node

// 共通ユーティリティ関数

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')

// 定数
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const JQUANTS_EMAIL = process.env.JQUANTS_EMAIL
const JQUANTS_PASSWORD = process.env.JQUANTS_PASSWORD
const JQUANTS_BASE_URL = 'https://api.jquants.com/v1'

// 環境変数チェック
function validateEnvVars() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !JQUANTS_EMAIL || !JQUANTS_PASSWORD) {
    console.error('❌ Missing required environment variables')
    console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_KEY, JQUANTS_EMAIL, JQUANTS_PASSWORD')
    process.exit(1)
  }
}

// Supabaseクライアント作成
function createSupabaseClient() {
  validateEnvVars()
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// 日付ユーティリティ
const dateUtils = {
  getYesterday() {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().split('T')[0]
  },

  getStartDate() {
    return '2020-09-06' // J-Quants APIデータ提供開始日
  },

  getCurrentWeekStart() {
    const today = new Date()
    const day = today.getDay()
    const sunday = new Date(today)
    sunday.setDate(today.getDate() - day)
    return sunday.toISOString().split('T')[0]
  },

  getLastWeekStart() {
    const today = new Date()
    const day = today.getDay()
    const lastSunday = new Date(today)
    lastSunday.setDate(today.getDate() - day - 7)
    return lastSunday.toISOString().split('T')[0]
  },

  getCurrentMonthStart() {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  },

  getLastMonthStart() {
    const today = new Date()
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return lastMonth.toISOString().split('T')[0]
  },

  isSaturday() {
    return new Date().getDay() === 6
  },

  isFirstOfMonth() {
    return new Date().getDate() === 1
  }
}

// J-Quants API クラス
class JQuantsAPI {
  constructor() {
    this.refreshToken = null
    this.accessToken = null
  }

  async login() {
    console.log('🔐 Logging into J-Quants API...')
    try {
      const response = await axios.post(`${JQUANTS_BASE_URL}/token/auth_user`, {
        mailaddress: JQUANTS_EMAIL,
        password: JQUANTS_PASSWORD
      })
      
      this.refreshToken = response.data.refreshToken
      
      if (!this.refreshToken) {
        console.error('❌ No refresh token found in response:', response.data)
        return false
      }
      
      console.log('✅ J-Quants login successful')
      return true
    } catch (error) {
      console.error('❌ J-Quants login failed:', error.response?.data || error.message)
      return false
    }
  }

  async getAccessToken() {
    if (!this.refreshToken) {
      console.error('❌ No refresh token available')
      return false
    }
    
    try {
      console.log('🔄 Getting access token...')
      
      const response = await axios.post(`${JQUANTS_BASE_URL}/token/auth_refresh?refreshtoken=${encodeURIComponent(this.refreshToken)}`)
      
      this.accessToken = response.data.idToken
      
      if (!this.accessToken) {
        console.error('❌ No access token found in response:', response.data)
        return false
      }
      
      console.log('✅ Access token obtained successfully')
      return true
    } catch (error) {
      console.error('❌ Failed to get access token:', error.response?.data || error.message)
      return false
    }
  }

  async getPrimeStocks() {
    try {
      console.log('📋 Fetching approved ticker list from ticker_master...')
      
      // ticker_masterから4桁コードを取得（ページング対応で全件取得）
      const supabase = new SupabaseHelper()
      let allData = []
      let from = 0
      const pageSize = 1000
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.client
          .from('ticker_master')
          .select('symbol')
          .order('symbol')
          .range(from, from + pageSize - 1)
        
        if (error) {
          console.error('❌ Failed to get ticker_master data:', error)
          return []
        }
        
        if (!data || data.length === 0) break
        
        allData = allData.concat(data)
        from += pageSize
        
        console.log(`📄 Fetched ticker page: ${from - pageSize + 1} to ${from - pageSize + data.length}`)
      }
      
      if (allData.length === 0) {
        console.error('❌ No tickers found in ticker_master')
        return []
      }
      
      const data = allData
      
      // 4桁コードを5桁（末尾0付き）に変換
      const fiveDigitTickers = data.map(row => row.symbol + '0')
      
      console.log(`📊 Found ${data.length} approved tickers in ticker_master`)
      console.log(`🔢 Converted to ${fiveDigitTickers.length} five-digit format for J-Quants API`)
      console.log(`📋 Sample tickers: ${fiveDigitTickers.slice(0, 5).join(', ')}...`)
      
      return fiveDigitTickers
    } catch (error) {
      console.error('❌ Failed to get ticker list from ticker_master:', error)
      return []
    }
  }

  async getStockData(ticker, fromDate, toDate = null) {
    if (!this.accessToken) return null
    
    try {
      const params = { code: ticker }
      
      if (toDate) {
        params.from = fromDate
        params.to = toDate
      } else {
        params.date = fromDate
      }
      
      const response = await axios.get(`${JQUANTS_BASE_URL}/prices/daily_quotes`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        params
      })
      
      return response.data.daily_quotes || []
    } catch (error) {
      console.error(`❌ Failed to get stock data for ${ticker}:`, error.response?.data || error.message)
      return null
    }
  }
}

// データ変換ユーティリティ
function convertToSupabaseFormat(jquantsData) {
  return jquantsData.map(item => ({
    ticker: item.Code,
    date: item.Date,
    timeframe: '1D',
    open: parseFloat(item.Open) || 0,
    high: parseFloat(item.High) || 0,
    low: parseFloat(item.Low) || 0,
    close: parseFloat(item.Close) || 0,
    volume: parseInt(item.Volume) || 0
  }))
}

// OHLC計算ユーティリティ
function calculateOHLC(dailyData) {
  if (!dailyData || dailyData.length === 0) return null
  
  // 時系列順にソート
  dailyData.sort((a, b) => new Date(a.date) - new Date(b.date))
  
  return {
    open: dailyData[0].open,
    close: dailyData[dailyData.length - 1].close,
    high: Math.max(...dailyData.map(d => d.high)),
    low: Math.min(...dailyData.filter(d => d.low > 0).map(d => d.low)),
    volume: dailyData.reduce((sum, d) => sum + (d.volume || 0), 0)
  }
}

// Supabase操作ユーティリティ
class SupabaseHelper {
  constructor() {
    this.client = createSupabaseClient()
  }

  async saveStockData(stockData) {
    if (!stockData || stockData.length === 0) return false
    
    // 大量データの場合はバッチ処理で保存
    const batchSize = 500
    let totalSaved = 0
    
    try {
      for (let i = 0; i < stockData.length; i += batchSize) {
        const batch = stockData.slice(i, i + batchSize)
        
        const { error } = await this.client
          .from('stock_prices')
          .upsert(batch, { 
            onConflict: 'ticker,date,timeframe',
            ignoreDuplicates: true 
          })
        
        if (error) {
          console.error(`❌ Failed to save batch ${Math.floor(i/batchSize) + 1}:`, error)
          return false
        }
        
        totalSaved += batch.length
        console.log(`✅ Saved batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(stockData.length/batchSize)}: ${batch.length} records (${totalSaved}/${stockData.length} total)`)
      }
      
      console.log(`🎉 Successfully saved all ${totalSaved} records to Supabase`)
      return true
    } catch (error) {
      console.error('❌ Supabase save error:', error)
      return false
    }
  }

  async getUpdatedTickers(targetDate) {
    try {
      const { data, error } = await this.client
        .from('stock_prices')
        .select('ticker')
        .eq('timeframe', '1D')
        .eq('date', targetDate)
      
      if (error) {
        console.error('Error fetching updated tickers:', error)
        return []
      }
      
      const uniqueTickers = [...new Set(data.map(item => item.ticker))]
      return uniqueTickers
    } catch (error) {
      console.error('Error in getUpdatedTickers:', error)
      return []
    }
  }

  async getDailyDataForPeriod(ticker, startDate, endDate) {
    try {
      const { data, error } = await this.client
        .from('stock_prices')
        .select('*')
        .eq('ticker', ticker)
        .eq('timeframe', '1D')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
      
      if (error) {
        console.error(`Error fetching daily data for ${ticker}:`, error)
        return []
      }
      
      return data || []
    } catch (error) {
      console.error(`Error in getDailyDataForPeriod for ${ticker}:`, error)
      return []
    }
  }
}

module.exports = {
  validateEnvVars,
  createSupabaseClient,
  dateUtils,
  JQuantsAPI,
  convertToSupabaseFormat,
  calculateOHLC,
  SupabaseHelper,
  JQUANTS_BASE_URL
}