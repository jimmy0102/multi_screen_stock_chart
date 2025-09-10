#!/usr/bin/env node

const { JQuantsAPI, convertToSupabaseFormat, SupabaseHelper, dateUtils } = require('./utils')
const { updateTickerMaster } = require('./update-ticker-master')

async function main() {
  // TARGET_DATE環境変数があればそれを使用、なければ昨日の日付を使用
  const targetDate = process.env.TARGET_DATE || dateUtils.getYesterday()
  
  console.log('🚀 Starting J-Quants daily data fetch...')
  console.log(`📅 Target date: ${targetDate}`)
  
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
  
  // 3. ticker_master更新（前段処理）
  console.log('\n🏢 Updating ticker_master before fetching stock data...')
  try {
    const updateResult = await updateTickerMaster()
    console.log(`✅ ticker_master updated: +${updateResult.added}, -${updateResult.removed}, total: ${updateResult.total}`)
  } catch (error) {
    console.error('❌ ticker_master update failed:', error.message)
    console.log('⚠️  Continuing with existing ticker_master data...')
  }
  
  // 4. 最新の東証プライム銘柄リスト取得（ticker_masterから）
  const tickers = await jquants.getPrimeStocks()
  if (tickers.length === 0) {
    console.error('❌ No tickers found')
    process.exit(1)
  }
  
  // 5. 各銘柄の指定日データ取得
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
  
  // 6. Supabaseに保存
  if (allStockData.length > 0) {
    const success = await supabase.saveStockData(allStockData)
    if (success) {
      console.log('🎉 Data fetch completed successfully!')
      console.log(`📊 Total records processed: ${allStockData.length}`)
      
      // 7. 週足・月足データの更新
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
      
      // 8. データヘルスチェック
      console.log('\n🔍 Performing data health check...')
      try {
        // 0価格データのチェック
        const { data: zeroData } = await supabase
          .from('stock_prices')
          .select('date, ticker')
          .eq('timeframe', '1D')
          .or('open.lte.0,high.lte.0,low.lte.0,close.lte.0')
          .limit(10)
        
        if (zeroData && zeroData.length > 0) {
          console.error('⚠️  Warning: Found zero-price 1D data:')
          zeroData.forEach(row => {
            console.error(`   - ${row.ticker} on ${row.date}`)
          })
        } else {
          console.log('✅ No zero-price data found')
        }
        
        // 最新データ件数の確認
        const { count: todayCount } = await supabase
          .from('stock_prices')
          .select('*', { count: 'exact', head: true })
          .eq('date', targetDate)
          .eq('timeframe', '1D')
        
        console.log(`📊 Today's data count: ${todayCount || 0} records for ${targetDate}`)
        
      } catch (error) {
        console.error('❌ Health check error:', error.message)
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