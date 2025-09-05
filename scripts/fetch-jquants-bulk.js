#!/usr/bin/env node

const { JQuantsAPI, convertToSupabaseFormat, SupabaseHelper, dateUtils } = require('./utils')
const fs = require('fs')

class BulkDataFetcher {
  constructor() {
    this.jquants = new JQuantsAPI()
    this.supabase = new SupabaseHelper()
    this.progressFile = './bulk-fetch-progress.json'
  }

  // 進捗をファイルに保存
  saveProgress(completedTickers) {
    try {
      fs.writeFileSync(this.progressFile, JSON.stringify({ 
        completedTickers,
        lastUpdate: new Date().toISOString()
      }, null, 2))
    } catch (error) {
      console.error('Warning: Could not save progress:', error.message)
    }
  }

  // 進捗を読み込み
  loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'))
        console.log(`📂 Resuming from progress: ${data.completedTickers.length} tickers completed`)
        return data.completedTickers
      }
    } catch (error) {
      console.error('Warning: Could not load progress:', error.message)
    }
    
    return []
  }

  async fetchBulkData(ticker) {
    try {
      console.log(`📈 Fetching bulk data for ${ticker}...`)
      
      const fromDate = dateUtils.getStartDate()
      const toDate = dateUtils.getYesterday()
      
      const stockData = await this.jquants.getStockData(ticker, fromDate, toDate)
      return stockData
    } catch (error) {
      console.error(`⚠️  Failed to process ${ticker}:`, error.message)
      
      // レートリミットエラーの場合は長時間待機
      if (error.response && error.response.status === 429) {
        console.log('🚨 Rate limit detected! Waiting 60 seconds...')
        await new Promise(resolve => setTimeout(resolve, 60000))
      }
      
      // その他のエラーでも短時間待機
      await new Promise(resolve => setTimeout(resolve, 5000))
      return null
    }
  }

  async run() {
    console.log('🚀 Starting J-Quants BULK data fetch (all available data)...')
    console.log(`📅 Date range: ${dateUtils.getStartDate()} to ${dateUtils.getYesterday()}`)
    
    // 進捗を読み込み
    const completedTickers = this.loadProgress()
    
    // 1. J-Quantsにログイン
    if (!(await this.jquants.login())) {
      process.exit(1)
    }
    
    // 2. アクセストークン取得
    if (!(await this.jquants.getAccessToken())) {
      process.exit(1)
    }
    
    // 3. プライム銘柄一覧取得
    const allTickers = await this.jquants.getPrimeStocks()
    if (allTickers.length === 0) {
      console.error('❌ No tickers found')
      process.exit(1)
    }
    
    // 未完了の銘柄のみ処理
    const remainingTickers = allTickers.filter(ticker => !completedTickers.includes(ticker))
    console.log(`📊 Total tickers: ${allTickers.length}, Remaining: ${remainingTickers.length}`)
    
    let totalRecords = 0
    let batchData = []
    const BATCH_SIZE = 1000 // バッチサイズ
    
    // 4. 各銘柄の株価データ取得
    for (let i = 0; i < remainingTickers.length; i++) {
      const ticker = remainingTickers[i]
      
      console.log(`\n[${i + 1}/${remainingTickers.length}] Processing ${ticker}...`)
      
      const stockData = await this.fetchBulkData(ticker)
      if (stockData && stockData.length > 0) {
        const convertedData = convertToSupabaseFormat(stockData)
        batchData.push(...convertedData)
        totalRecords += convertedData.length
        console.log(`✅ Got ${convertedData.length} records for ${ticker}`)
      } else {
        console.log(`⚠️  No data for ${ticker}`)
      }
      
      completedTickers.push(ticker)
      
      // バッチサイズに達したら保存
      if (batchData.length >= BATCH_SIZE) {
        await this.supabase.saveStockData(batchData)
        batchData = []
      }
      
      // 進捗保存（100銘柄ごと）
      if ((i + 1) % 100 === 0) {
        this.saveProgress(completedTickers)
        console.log(`💾 Progress saved: ${completedTickers.length} tickers completed`)
      }
      
      // API制限対策：リクエスト間隔を空ける（レートリミット回避のため1秒間隔）
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // トークンの期限切れ対策（30分ごとに更新、レートリミットを考慮）
      if ((i + 1) % 300 === 0) {
        console.log('🔄 Refreshing access token...')
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2秒待機
        await this.jquants.getAccessToken()
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2秒待機
      }
      
      // 大量アクセス対策：100銘柄ごとに長めの休憩
      if ((i + 1) % 100 === 0) {
        console.log(`⏸️  Taking a break after ${i + 1} tickers (rate limit protection)...`)
        await new Promise(resolve => setTimeout(resolve, 10000)) // 10秒休憩
      }
    }
    
    // 残りのデータを保存
    if (batchData.length > 0) {
      await this.supabase.saveStockData(batchData)
    }
    
    // 最終進捗保存
    this.saveProgress(completedTickers)
    
    console.log('\n🎉 Bulk data fetch completed!')
    console.log(`📊 Total records processed: ${totalRecords}`)
    console.log(`📈 Total tickers processed: ${completedTickers.length}`)
  }
}

// 実行
const fetcher = new BulkDataFetcher()
fetcher.run().catch(error => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})