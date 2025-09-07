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
    
    // 3. J-Quants APIから最新の東証プライム銘柄リスト取得
    console.log('📋 Fetching latest TSE Prime stocks from J-Quants API...')
    const response = await require('axios').get(`https://api.jquants.com/v1/listed/info`, {
      headers: {
        'Authorization': `Bearer ${jquants.accessToken}`
      }
    })
    
    // 東証プライムのみ
    const allStocks = response.data.info.filter(stock => 
      stock.MarketCode === '0111' || stock.MarketCodeName === 'プライム'
    )
    
    console.log(`📊 Found ${allStocks.length} stocks in TSE Prime`)
    
    // 4. 末尾0の5桁コードのみ許可（通常株式 + 特殊コード）
    const normalStocks = allStocks.filter(stock => {
      const code = stock.Code || ''
      
      // 5桁以外は除外
      if (code.length !== 5) return false
      
      // 末尾0以外は除外（通常株式86970、特殊コード167A0のみ許可）
      if (!code.match(/^.{4}0$/)) return false
      
      return true
    })
    
    console.log(`🔍 Filtered to ${normalStocks.length} normal stocks (excluded ${allStocks.length - normalStocks.length} special securities)`)
    
    // 5. 現在のticker_masterを取得（ページング対応）
    console.log('📋 Fetching current ticker_master data...')
    let allCurrentTickers = []
    let from = 0
    const pageSize = 1000
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.client
        .from('ticker_master')
        .select('symbol, name, market, sector')
        .order('symbol')
        .range(from, from + pageSize - 1)
      
      if (error) {
        throw new Error(`Failed to fetch current ticker_master: ${error.message}`)
      }
      
      if (!data || data.length === 0) break
      
      allCurrentTickers = allCurrentTickers.concat(data)
      from += pageSize
      
      console.log(`📄 Fetched page: ${from - pageSize + 1} to ${from - pageSize + data.length}`)
    }
    
    const currentTickers = allCurrentTickers
    
    console.log(`💾 Current ticker_master has ${currentTickers?.length || 0} tickers`)
    
    // 5.5. 銘柄数の比較 - 差異がない場合は早期リターン
    const currentCount = currentTickers?.length || 0
    const newCount = normalStocks.length
    
    if (currentCount === newCount) {
      console.log('✅ No change in ticker count - skipping update')
      console.log(`📊 Both current and new have ${currentCount} tickers`)
      return {
        success: true,
        added: 0,
        removed: 0,
        total: currentCount,
        skipped: true
      }
    }
    
    console.log(`🔄 Ticker count changed: ${currentCount} → ${newCount} (${newCount - currentCount > 0 ? '+' : ''}${newCount - currentCount})`)
    
    // 6. 新規銘柄と削除対象を特定
    const currentSymbols = new Set(currentTickers.map(t => t.symbol))
    const newSymbols = new Set(normalStocks.map(s => s.Code.slice(0, 4))) // 5桁から4桁に変換
    
    const toAdd = normalStocks.filter(stock => !currentSymbols.has(stock.Code.slice(0, 4)))
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
        symbol: stock.Code.slice(0, 4), // 5桁コードから4桁に変換（例：86970 → 8697）
        name: stock.CompanyName,
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
        console.log(`   + ${stock.Code.slice(0, 4)}: ${stock.CompanyName}`)
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