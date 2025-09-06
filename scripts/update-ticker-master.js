#!/usr/bin/env node

const { JQuantsAPI, SupabaseHelper } = require('./utils')

async function updateTickerMaster() {
  console.log('🏢 Starting ticker_master update process...')
  
  const jquants = new JQuantsAPI()
  const supabase = new SupabaseHelper()
  
  try {
    // 1. J-Quantsにログイン
    if (!(await jquants.login())) {
      throw new Error('J-Quants login failed')
    }
    
    // 2. アクセストークン取得
    if (!(await jquants.getAccessToken())) {
      throw new Error('J-Quants access token failed')
    }
    
    // 3. J-Quants APIから最新のプライム銘柄リスト取得
    console.log('📋 Fetching latest TSE Prime stocks from J-Quants API...')
    const response = await require('axios').get(`https://api.jquants.com/v1/listed/info`, {
      headers: {
        'Authorization': `Bearer ${jquants.accessToken}`
      }
    })
    
    const allStocks = response.data.info.filter(stock => 
      stock.MarketCode === '0111' || stock.MarketCodeName === 'プライム'
    )
    
    console.log(`📊 Found ${allStocks.length} stocks in TSE Prime`)
    
    // 4. 特殊証券を除外（優先株、社債型種類株、REIT等）
    const normalStocks = allStocks.filter(stock => {
      const name = stock.CompanyName || ''
      const code = stock.Code || ''
      
      // 除外条件
      const isSpecialSecurity = 
        name.includes('優先株') ||
        name.includes('種類株') ||
        name.includes('社債型') ||
        name.includes('REIT') ||
        name.includes('リート') ||
        name.includes('投資法人') ||
        name.includes('第１種') ||
        name.includes('第1種') ||
        name.includes('第２種') ||
        name.includes('第2種') ||
        code.length !== 4 ||  // 4桁以外は除外
        !code.match(/^[0-9]{4}$/) // 数値4桁以外は除外
      
      return !isSpecialSecurity
    })
    
    console.log(`🔍 Filtered to ${normalStocks.length} normal stocks (excluded ${allStocks.length - normalStocks.length} special securities)`)
    
    // 5. 現在のticker_masterを取得
    const { data: currentTickers, error: fetchError } = await supabase.client
      .from('ticker_master')
      .select('symbol, name, market, sector')
      .order('symbol')
    
    if (fetchError) {
      throw new Error(`Failed to fetch current ticker_master: ${fetchError.message}`)
    }
    
    console.log(`💾 Current ticker_master has ${currentTickers?.length || 0} tickers`)
    
    // 6. 新規銘柄と削除対象を特定
    const currentSymbols = new Set(currentTickers.map(t => t.symbol))
    const newSymbols = new Set(normalStocks.map(s => s.Code))
    
    const toAdd = normalStocks.filter(stock => !currentSymbols.has(stock.Code))
    const toRemove = currentTickers.filter(ticker => !newSymbols.has(ticker.symbol))
    
    console.log(`📈 New tickers to add: ${toAdd.length}`)
    console.log(`📉 Tickers to remove: ${toRemove.length}`)
    
    // 7. 削除実行
    if (toRemove.length > 0) {
      console.log('🗑️  Removing outdated tickers...')
      const symbolsToRemove = toRemove.map(t => t.symbol)
      
      const { error: deleteError } = await supabase.client
        .from('ticker_master')
        .delete()
        .in('symbol', symbolsToRemove)
      
      if (deleteError) {
        throw new Error(`Failed to delete tickers: ${deleteError.message}`)
      }
      
      console.log(`✅ Removed ${toRemove.length} outdated tickers:`)
      toRemove.forEach(ticker => {
        console.log(`   - ${ticker.symbol}: ${ticker.name}`)
      })
    }
    
    // 8. 新規追加実行
    if (toAdd.length > 0) {
      console.log('➕ Adding new tickers...')
      
      const tickersToInsert = toAdd.map(stock => ({
        symbol: stock.Code,
        name: stock.CompanyName,
        company_name: stock.CompanyName, // utils.jsのgetPrimeStocksが使用する可能性があるため
        market: 'TSE',
        sector: stock.Sector17CodeName || stock.SectorName || '不明'
      }))
      
      const { error: insertError } = await supabase.client
        .from('ticker_master')
        .insert(tickersToInsert)
      
      if (insertError) {
        throw new Error(`Failed to insert new tickers: ${insertError.message}`)
      }
      
      console.log(`✅ Added ${toAdd.length} new tickers:`)
      toAdd.slice(0, 10).forEach(stock => {
        console.log(`   + ${stock.Code}: ${stock.CompanyName}`)
      })
      if (toAdd.length > 10) {
        console.log(`   ... and ${toAdd.length - 10} more`)
      }
    }
    
    // 9. 最終確認
    const { count: finalCount, error: countError } = await supabase.client
      .from('ticker_master')
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      console.warn('⚠️  Could not verify final count:', countError.message)
    } else {
      console.log(`📊 Final ticker_master count: ${finalCount} tickers`)
    }
    
    console.log('🎉 ticker_master update completed successfully!')
    
    return {
      success: true,
      added: toAdd.length,
      removed: toRemove.length,
      total: finalCount || normalStocks.length
    }
    
  } catch (error) {
    console.error('❌ ticker_master update failed:', error.message)
    throw error
  }
}

// スクリプト直接実行時
if (require.main === module) {
  updateTickerMaster()
    .then(result => {
      console.log(`✅ Update complete: +${result.added}, -${result.removed}, total: ${result.total}`)
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 Update failed:', error.message)
      process.exit(1)
    })
}

module.exports = { updateTickerMaster }