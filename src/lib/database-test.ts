// デバッグ用：Supabaseの接続テスト
import { supabase } from './supabase'

export async function testSupabaseConnection() {
  console.log('[DatabaseTest] Testing Supabase connection...')
  
  try {
    // 1. 簡単なクエリでテスト
    const { data, error } = await Promise.race([
      supabase.from('ticker_master').select('count').single(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 2000))
    ]) as any
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = single row expected but multiple returned
      console.error('[DatabaseTest] Connection error:', error)
      return false
    }
    
    console.log('[DatabaseTest] Connection successful')
    return true
  } catch (error) {
    console.error('[DatabaseTest] Connection failed:', error)
    return false
  }
}

export async function getTickersWithRetry(): Promise<any[]> {
  console.log('[DatabaseTest] Getting tickers with retry...')
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[DatabaseTest] Attempt ${attempt}/3`)
      
      const { data, error } = await Promise.race([
        supabase.from('ticker_master').select('*').order('symbol'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]) as any
      
      if (error) {
        console.error(`[DatabaseTest] Attempt ${attempt} error:`, error)
        if (attempt === 3) throw error
        await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒待機
        continue
      }
      
      console.log(`[DatabaseTest] Success on attempt ${attempt}:`, data?.length || 0, 'tickers')
      return data || []
    } catch (error) {
      console.error(`[DatabaseTest] Attempt ${attempt} failed:`, error)
      if (attempt === 3) {
        console.error('[DatabaseTest] All attempts failed')
        return []
      }
      await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒待機
    }
  }
  
  return []
}