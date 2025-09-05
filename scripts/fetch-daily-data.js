#!/usr/bin/env node

/**
 * Daily Stock Data Fetch Script for GitHub Actions
 * J-Quants APIからデータを取得してSupabaseに保存
 */

const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const fs = require('fs').promises
const path = require('path')

// ログディレクトリ作成
const logDir = path.join(__dirname, '..', 'logs')
const logFile = path.join(logDir, `fetch-${new Date().toISOString().split('T')[0]}.log`)

class Logger {
  static async log(message) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    
    try {
      await fs.mkdir(logDir, { recursive: true })
      await fs.appendFile(logFile, logMessage + '\n')
    } catch (error) {
      console.error('Failed to write log:', error)
    }
  }
}

class DataFetcher {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )
    this.jquantsEmail = process.env.JQUANTS_EMAIL
    this.jquantsPassword = process.env.JQUANTS_PASSWORD
    this.idToken = null
    this.baseUrl = 'https://api.jquants.com/v1'
  }

  async authenticate() {
    try {
      Logger.log('Authenticating with J-Quants API...')
      
      // Step 1: Get refresh token
      const authResponse = await axios.post(`${this.baseUrl}/token/auth_user`, {
        mailaddress: this.jquantsEmail,
        password: this.jquantsPassword
      })

      const refreshToken = authResponse.data.refreshToken
      if (!refreshToken) {
        throw new Error('Failed to get refresh token')
      }

      // Step 2: Get ID token
      const tokenResponse = await axios.post(
        `${this.baseUrl}/token/auth_refresh?refreshtoken=${refreshToken}`
      )
      
      this.idToken = tokenResponse.data.idToken
      if (!this.idToken) {
        throw new Error('Failed to get ID token')
      }

      Logger.log('J-Quants authentication successful')
      return true
    } catch (error) {
      Logger.log(`Authentication failed: ${error.message}`)
      return false
    }
  }

  async fetchTickers() {
    try {
      Logger.log('Fetching ticker list from J-Quants...')
      
      const response = await axios.get(`${this.baseUrl}/listed/info`, {
        headers: {
          'Authorization': `Bearer ${this.idToken}`,
          'Accept': 'application/json'
        }
      })
      
      if (!response.data || !response.data.info) {
        throw new Error('No ticker data received')
      }

      // プライム市場の普通株式のみフィルタ
      const tickers = response.data.info
        .filter(stock => 
          (stock.MarketCodeName === 'プライム' || stock.MarketCode === '0111') &&
          stock.Code.length === 5 && 
          stock.Code.endsWith('0')
        )
        .map(stock => ({
          symbol: stock.Code.slice(0, 4),
          name: stock.CompanyName,
          market: 'Prime',
          sector: stock.Sector33CodeName
        }))

      Logger.log(`Fetched ${tickers.length} Prime market tickers`)
      return tickers
    } catch (error) {
      Logger.log(`Failed to fetch tickers: ${error.message}`)
      return []
    }
  }

  async upsertTickers(tickers) {
    try {
      Logger.log(`Upserting ${tickers.length} tickers to database...`)
      
      const { error } = await this.supabase
        .from('ticker_master')
        .upsert(tickers, { 
          onConflict: 'symbol',
          ignoreDuplicates: false 
        })

      if (error) {
        throw error
      }

      Logger.log('Tickers updated successfully')
      return true
    } catch (error) {
      Logger.log(`Failed to upsert tickers: ${error.message}`)
      return false
    }
  }

  async fetchStockData(ticker, fromDate, toDate) {
    try {
      const response = await axios.get(`${this.baseUrl}/prices/daily_quotes`, {
        headers: {
          'Authorization': `Bearer ${this.idToken}`
        },
        params: {
          code: ticker,
          from: fromDate,
          to: toDate
        }
      })

      if (!response.data || !response.data.daily_quotes) {
        return []
      }

      return response.data.daily_quotes.filter(data => 
        data.AdjustmentOpen !== null && 
        data.AdjustmentClose !== null && 
        data.AdjustmentHigh !== null && 
        data.AdjustmentLow !== null
      )
    } catch (error) {
      Logger.log(`Failed to fetch stock data for ${ticker}: ${error.message}`)
      return []
    }
  }

  convertToTimeframes(dailyData, ticker) {
    if (!dailyData.length) return { daily: [], weekly: [], monthly: [] }

    const daily = dailyData.map(data => ({
      ticker,
      date: data.Date,
      timeframe: '1D',
      open: parseFloat(data.AdjustmentOpen),
      high: parseFloat(data.AdjustmentHigh),
      low: parseFloat(data.AdjustmentLow),
      close: parseFloat(data.AdjustmentClose),
      volume: parseInt(data.AdjustmentVolume || 0)
    }))

    // 週足データ生成（簡略化）
    const weekly = this.aggregateToWeekly(dailyData, ticker)
    
    // 月足データ生成（簡略化）
    const monthly = this.aggregateToMonthly(dailyData, ticker)

    return { daily, weekly, monthly }
  }

  aggregateToWeekly(dailyData, ticker) {
    // 実装は簡略化 - 実際のプロダクションでは正確な週足計算が必要
    const sorted = [...dailyData].sort((a, b) => a.Date.localeCompare(b.Date))
    const weekly = []
    
    for (let i = 0; i < sorted.length; i += 5) {
      const weekData = sorted.slice(i, i + 5).filter(d => d.AdjustmentClose !== null)
      if (weekData.length === 0) continue
      
      weekly.push({
        ticker,
        date: weekData[weekData.length - 1].Date,
        timeframe: '1W',
        open: parseFloat(weekData[0].AdjustmentOpen),
        high: Math.max(...weekData.map(d => parseFloat(d.AdjustmentHigh))),
        low: Math.min(...weekData.map(d => parseFloat(d.AdjustmentLow))),
        close: parseFloat(weekData[weekData.length - 1].AdjustmentClose),
        volume: weekData.reduce((sum, d) => sum + parseInt(d.AdjustmentVolume || 0), 0)
      })
    }
    
    return weekly
  }

  aggregateToMonthly(dailyData, ticker) {
    // 実装は簡略化 - 実際のプロダクションでは正確な月足計算が必要
    const sorted = [...dailyData].sort((a, b) => a.Date.localeCompare(b.Date))
    const monthly = []
    let currentMonth = ''
    let monthData = []
    
    for (const data of sorted) {
      const month = data.Date.substring(0, 7) // YYYY-MM
      
      if (month !== currentMonth) {
        if (monthData.length > 0) {
          monthly.push({
            ticker,
            date: monthData[monthData.length - 1].Date,
            timeframe: '1M',
            open: parseFloat(monthData[0].AdjustmentOpen),
            high: Math.max(...monthData.map(d => parseFloat(d.AdjustmentHigh))),
            low: Math.min(...monthData.map(d => parseFloat(d.AdjustmentLow))),
            close: parseFloat(monthData[monthData.length - 1].AdjustmentClose),
            volume: monthData.reduce((sum, d) => sum + parseInt(d.AdjustmentVolume || 0), 0)
          })
        }
        currentMonth = month
        monthData = []
      }
      
      if (data.AdjustmentClose !== null) {
        monthData.push(data)
      }
    }
    
    // 最後の月のデータを追加
    if (monthData.length > 0) {
      monthly.push({
        ticker,
        date: monthData[monthData.length - 1].Date,
        timeframe: '1M',
        open: parseFloat(monthData[0].AdjustmentOpen),
        high: Math.max(...monthData.map(d => parseFloat(d.AdjustmentHigh))),
        low: Math.min(...monthData.map(d => parseFloat(d.AdjustmentLow))),
        close: parseFloat(monthData[monthData.length - 1].AdjustmentClose),
        volume: monthData.reduce((sum, d) => sum + parseInt(d.AdjustmentVolume || 0), 0)
      })
    }
    
    return monthly
  }

  async upsertStockData(stockData) {
    if (!stockData.length) return true

    try {
      const { error } = await this.supabase
        .from('stock_prices')
        .upsert(stockData, { 
          onConflict: 'ticker,date,timeframe',
          ignoreDuplicates: false 
        })

      if (error) {
        throw error
      }

      return true
    } catch (error) {
      Logger.log(`Failed to upsert stock data: ${error.message}`)
      return false
    }
  }

  async run() {
    try {
      Logger.log('Starting daily data fetch...')
      
      // 認証
      const authenticated = await this.authenticate()
      if (!authenticated) {
        throw new Error('Authentication failed')
      }

      // 銘柄リスト更新
      const tickers = await this.fetchTickers()
      if (tickers.length > 0) {
        await this.upsertTickers(tickers)
      }

      // 株価データ取得期間設定
      const targetDate = process.env.TARGET_DATE || new Date().toISOString().split('T')[0]
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 30) // 過去30日分
      const fromDateStr = fromDate.toISOString().split('T')[0]

      Logger.log(`Fetching stock data from ${fromDateStr} to ${targetDate}`)

      // 主要銘柄のデータを取得（レート制限を考慮して一部のみ）
      const majorTickers = ['1301', '7203', '6758', '8001', '9432'] // サンプル
      
      for (const tickerCode of majorTickers) {
        Logger.log(`Processing ${tickerCode}...`)
        
        const dailyData = await this.fetchStockData(tickerCode, fromDateStr, targetDate)
        if (dailyData.length > 0) {
          const { daily, weekly, monthly } = this.convertToTimeframes(dailyData, tickerCode)
          
          // 各タイムフレームのデータを保存
          await this.upsertStockData(daily)
          await this.upsertStockData(weekly)
          await this.upsertStockData(monthly)
          
          Logger.log(`Processed ${tickerCode}: ${daily.length}D, ${weekly.length}W, ${monthly.length}M`)
        }
        
        // レート制限対策で待機
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      Logger.log('Daily data fetch completed successfully')
    } catch (error) {
      Logger.log(`Daily data fetch failed: ${error.message}`)
      process.exit(1)
    }
  }
}

// スクリプト実行
if (require.main === module) {
  const fetcher = new DataFetcher()
  fetcher.run()
}