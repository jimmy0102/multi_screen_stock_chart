// シンプルなデータベースクライアント（タイムアウト対策）
import { supabase } from './supabase'
import { fallbackTickers } from './fallback-data'

// 基本的なリトライ機能付きデータ取得
export async function getTickersSimple(): Promise<any[]> {
  console.log('[DatabaseSimple] Getting tickers...')
  
  try {
    console.log('[DatabaseSimple] Creating query...')
    const query = supabase
      .from('ticker_master')
      .select('*')
      .order('symbol')
    
    console.log('[DatabaseSimple] Executing query...')
    const startTime = Date.now()
    
    const result = await Promise.race([
      query,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 5s')), 5000)
      })
    ]) as any
    
    const elapsed = Date.now() - startTime
    console.log(`[DatabaseSimple] Query completed in ${elapsed}ms`)
    
    const { data, error } = result
    
    if (error) {
      console.error('[DatabaseSimple] Error:', error)
      return []
    }
    
    console.log('[DatabaseSimple] Success:', data?.length || 0, 'tickers')
    console.log('[DatabaseSimple] First ticker:', data?.[0])
    return data || []
  } catch (error) {
    console.error('[DatabaseSimple] Failed:', error)
    console.log('[DatabaseSimple] Using fallback data...')
    return fallbackTickers
  }
}

export async function getFavoritesSimple(userId?: string): Promise<any[]> {
  console.log('[DatabaseSimple] Getting favorites for user:', userId)
  
  if (!userId) {
    console.log('[DatabaseSimple] No user ID, returning empty favorites')
    return []
  }
  
  try {
    console.log('[DatabaseSimple] Attempting to fetch favorites...')
    
    const result = await Promise.race([
      supabase
        .from('watchlists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Favorites query timeout after 3s')), 3000)
      })
    ]) as any
    
    const { data, error } = result
    
    if (error) {
      console.error('[DatabaseSimple] Favorites error:', error)
      return []
    }
    
    console.log('[DatabaseSimple] Favorites success:', data?.length || 0)
    return data || []
  } catch (error) {
    console.error('[DatabaseSimple] Favorites failed:', error)
    console.log('[DatabaseSimple] Returning empty favorites list')
    return []
  }
}