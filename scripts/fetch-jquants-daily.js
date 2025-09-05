#!/usr/bin/env node

const { JQuantsAPI, convertToSupabaseFormat, SupabaseHelper, dateUtils } = require('./utils')

async function main() {
  console.log('🚀 Starting J-Quants daily data fetch...')
  console.log(`📅 Target date: ${dateUtils.getYesterday()}`)
  
  const jquants = new JQuantsAPI()
  const supabase = new SupabaseHelper()
  
  // 1. J-Quantsにログイン
  if (!(await jquants.login())) {
    process.exit(1)
  }
  
  // 2. アクセストークン取得
  if (!(await jquants.getAccessToken())) {
    process.exit(1)
  }
  
  // 3. 最新の東証プライム銘柄リスト取得
  const tickers = await jquants.getPrimeStocks()
  if (tickers.length === 0) {
    console.error('❌ No tickers found')
    process.exit(1)
  }
  
  // 4. 各銘柄の前営業日データ取得
  const targetDate = dateUtils.getYesterday()
  const allStockData = []
  
  console.log(`📈 Processing ${tickers.length} tickers...`)
  
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    
    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(`[${i + 1}/${tickers.length}] Fetching ${ticker}...`)
    }
    
    const stockData = await jquants.getStockData(ticker, targetDate)
    if (stockData && stockData.length > 0) {
      const convertedData = convertToSupabaseFormat(stockData)
      allStockData.push(...convertedData)
    }
    
    // API制限対策
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 進捗表示
    if ((i + 1) % 100 === 0) {
      console.log(`📊 Progress: ${i + 1}/${tickers.length} tickers processed, ${allStockData.length} records collected`)
    }
  }
  
  // 5. Supabaseに保存
  if (allStockData.length > 0) {
    const success = await supabase.saveStockData(allStockData)
    if (success) {
      console.log('🎉 Data fetch completed successfully!')
      console.log(`📊 Total records processed: ${allStockData.length}`)
      
      // 6. 週足・月足データの更新
      console.log('\n🔄 Updating weekly and monthly timeframes...')
      try {
        const { spawn } = require('child_process')
        const updateProcess = spawn('node', ['scripts/update-timeframes-daily.js'], {
          stdio: 'inherit',
          cwd: process.cwd()
        })
        
        await new Promise((resolve, reject) => {
          updateProcess.on('close', (code) => {
            if (code === 0) {
              console.log('✅ Timeframe update completed successfully!')
              resolve()
            } else {
              console.error(`❌ Timeframe update failed with code ${code}`)
              reject(new Error(`Timeframe update failed with code ${code}`))
            }
          })
          
          updateProcess.on('error', (error) => {
            console.error('❌ Failed to start timeframe update:', error)
            reject(error)
          })
        })
      } catch (error) {
        console.error('❌ Timeframe update error:', error.message)
        // エラーでも日次更新は成功とみなす
      }
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