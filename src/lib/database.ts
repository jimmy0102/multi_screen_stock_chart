import { supabase } from './supabase'
import type { 
  StockPrice, 
  TickerMaster, 
  Watchlist, 
  ChartDrawing, 
  Note 
} from './supabase'

export class SupabaseDatabase {
  // 銘柄関連
  async getAllTickers(): Promise<TickerMaster[]> {
    console.log('[Database] Fetching all tickers...')
    try {
      const startTime = Date.now()
      
      // タイムアウト設定
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tickers fetch timeout')), 5000)
      })
      
      const tickersPromise = supabase
        .from('ticker_master')
        .select('*')
        .order('symbol')
      
      const result = await Promise.race([tickersPromise, timeoutPromise]) as any
      const elapsed = Date.now() - startTime
      
      console.log(`[Database] Tickers fetch completed in ${elapsed}ms`)
      
      const { data, error } = result

      if (error) {
        console.error('[Database] Error fetching tickers:', error)
        return []
      }

      console.log('[Database] Tickers fetched successfully:', data?.length || 0)
      return data || []
    } catch (error) {
      console.error('[Database] getAllTickers failed:', error)
      return []
    }
  }

  async getTickerBySymbol(symbol: string): Promise<TickerMaster | null> {
    const { data, error } = await supabase
      .from('ticker_master')
      .select('*')
      .eq('symbol', symbol)
      .single()

    if (error) {
      console.error('Error fetching ticker:', error)
      return null
    }

    return data
  }

  // 株価データ関連
  async getStockData(
    ticker: string, 
    timeframe: string, 
    limit?: number
  ): Promise<StockPrice[]> {
    let query = supabase
      .from('stock_prices')
      .select('*')
      .eq('ticker', ticker)
      .eq('timeframe', timeframe)
      .order('date', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching stock data:', error)
      return []
    }

    return data || []
  }

  async getStockDataCount(ticker: string, timeframe: string): Promise<number> {
    const { count, error } = await supabase
      .from('stock_prices')
      .select('*', { count: 'exact', head: true })
      .eq('ticker', ticker)
      .eq('timeframe', timeframe)

    if (error) {
      console.error('Error counting stock data:', error)
      return 0
    }

    return count || 0
  }

  async getLatestStockPrice(ticker: string): Promise<StockPrice | null> {
    const { data, error } = await supabase
      .from('stock_prices')
      .select('*')
      .eq('ticker', ticker)
      .eq('timeframe', '1D')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('Error fetching latest stock price:', error)
      return null
    }

    return data
  }

  // ウォッチリスト関連
  async getFavorites(): Promise<Watchlist[]> {
    console.log('[Database] Fetching favorites...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('[Database] No user found, returning empty favorites')
        return []
      }

      const startTime = Date.now()
      
      // タイムアウト設定
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Favorites fetch timeout')), 3000)
      })
      
      const favoritesPromise = supabase
        .from('watchlists')
        .select(`
        *,
        ticker_master (
          symbol,
          name,
          market
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

      const result = await Promise.race([favoritesPromise, timeoutPromise]) as any
      const elapsed = Date.now() - startTime
      
      console.log(`[Database] Favorites fetch completed in ${elapsed}ms`)
      
      const { data, error } = result

      if (error) {
        console.error('[Database] Error fetching favorites:', error)
        return []
      }

      console.log('[Database] Favorites fetched successfully:', data?.length || 0)
      return data || []
    } catch (error) {
      console.error('[Database] getFavorites failed:', error)
      return []
    }
  }

  async addToFavorites(ticker: string, name?: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('watchlists')
      .insert({
        user_id: user.id,
        ticker,
        name
      })

    if (error) {
      console.error('Error adding to favorites:', error)
      return false
    }

    return true
  }

  async removeFromFavorites(ticker: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('watchlists')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker)

    if (error) {
      console.error('Error removing from favorites:', error)
      return false
    }

    return true
  }

  async isFavorite(ticker: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('ticker', ticker)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking favorite status:', error)
      return false
    }

    return !!data
  }

  // メモ関連
  async getNotesByTicker(ticker: string): Promise<Note[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching notes:', error)
      return []
    }

    return data || []
  }

  async insertNote(ticker: string, text: string): Promise<Note | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        ticker,
        text
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting note:', error)
      return null
    }

    return data
  }

  async updateNote(id: string, text: string): Promise<Note | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('notes')
      .update({ text })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating note:', error)
      return null
    }

    return data
  }

  async deleteNote(id: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting note:', error)
      return false
    }

    return true
  }

  // チャート描画関連
  async getChartDrawings(ticker: string, timeframe: string): Promise<ChartDrawing[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('chart_drawings')
      .select('*')
      .eq('user_id', user.id)
      .eq('ticker', ticker)
      .eq('timeframe', timeframe)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching chart drawings:', error)
      return []
    }

    return data || []
  }

  async saveChartDrawing(
    ticker: string,
    timeframe: string,
    type: string,
    data: Record<string, any>
  ): Promise<ChartDrawing | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: drawing, error } = await supabase
      .from('chart_drawings')
      .insert({
        user_id: user.id,
        ticker,
        timeframe,
        type,
        data
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving chart drawing:', error)
      return null
    }

    return drawing
  }

  async deleteChartDrawing(id: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('chart_drawings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting chart drawing:', error)
      return false
    }

    return true
  }

  // リアルタイム購読
  subscribeToStockPrices(ticker: string, callback: (data: any) => void) {
    return supabase
      .channel(`stock-${ticker}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'stock_prices',
          filter: `ticker=eq.${ticker}` 
        }, 
        callback
      )
      .subscribe()
  }

  subscribeToWatchlist(callback: (data: any) => void) {
    return supabase
      .channel('watchlist')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'watchlists' 
        }, 
        callback
      )
      .subscribe()
  }

  subscribeToChartDrawings(ticker: string, timeframe: string, callback: (data: any) => void) {
    return supabase
      .channel(`drawings-${ticker}-${timeframe}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'chart_drawings',
          filter: `ticker=eq.${ticker}.and.timeframe=eq.${timeframe}` 
        }, 
        callback
      )
      .subscribe()
  }
}

// シングルトンインスタンス
export const database = new SupabaseDatabase()