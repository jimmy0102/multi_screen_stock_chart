// Supabaseの直接テスト（ブラウザ環境）
import { supabase } from './supabase'

export async function testDirectConnection() {
  console.log('[DirectTest] Starting Supabase direct test...')
  
  try {
    // 1. 基本的な接続テスト
    console.log('[DirectTest] Test 1: Basic connection')
    const { data: auth } = await supabase.auth.getUser()
    console.log('[DirectTest] Auth user:', !!auth.user)
    
    // 2. シンプルなクエリ
    console.log('[DirectTest] Test 2: Simple query')
    const { data: simple, error: simpleError } = await supabase
      .rpc('version')
    console.log('[DirectTest] Version query:', { simple, simpleError })
    
    // 3. ticker_master テーブルへの直接アクセス
    console.log('[DirectTest] Test 3: Direct ticker_master access')
    const { data: tickers, error: tickerError } = await supabase
      .from('ticker_master')
      .select('count')
      .limit(1)
    console.log('[DirectTest] Count query:', { tickers, tickerError })
    
    // 4. 実際のデータ取得
    console.log('[DirectTest] Test 4: Actual data fetch')
    const { data: actualData, error: actualError } = await supabase
      .from('ticker_master')
      .select('symbol, name')
      .limit(3)
    console.log('[DirectTest] Data query:', { 
      count: actualData?.length, 
      first: actualData?.[0], 
      error: actualError 
    })
    
    console.log('[DirectTest] All tests completed')
    return true
    
  } catch (error) {
    console.error('[DirectTest] Test failed:', error)
    return false
  }
}