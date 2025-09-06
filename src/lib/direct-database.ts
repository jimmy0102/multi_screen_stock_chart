// Direct HTTP implementation to bypass Supabase JavaScript library
import type { TickerMaster, StockPrice, Watchlist, ChartDrawing, Note } from './supabase'

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY

class DirectSupabaseDatabase {
  private baseUrl = `${SUPABASE_URL}/rest/v1`
  private headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    console.log(`[DirectDB] Making request to: ${this.baseUrl}${endpoint}`)
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[DirectDB] Request failed:`, response.status, error)
      throw new Error(`HTTP ${response.status}: ${error}`)
    }

    const data = await response.json()
    console.log(`[DirectDB] Response received:`, data.length || data)
    return data
  }

  // 銘柄関連
  async getAllTickers(): Promise<TickerMaster[]> {
    console.log('[DirectDB] Fetching all tickers from ticker_master...')
    
    try {
      const startTime = Date.now()
      const allTickers: TickerMaster[] = []
      let offset = 0
      const limit = 1000
      
      // ページネーションで全件取得
      // eslint-disable-next-line no-constant-condition
      while (true) {
        console.log(`[DirectDB] Fetching batch ${Math.floor(offset/limit) + 1} (offset: ${offset}, limit: ${limit})`)
        
        const endpoint = `/ticker_master?select=*&order=symbol&offset=${offset}&limit=${limit}`
        const data = await this.request(endpoint)
        
        if (data.length === 0) {
          console.log(`[DirectDB] No more data, stopping pagination`)
          break
        }
        
        allTickers.push(...data)
        console.log(`[DirectDB] Retrieved ${data.length} tickers, total so far: ${allTickers.length}`)
        
        // データが制限値より少ない場合、これが最後のページ
        if (data.length < limit) {
          console.log(`[DirectDB] Last page reached (${data.length} < ${limit})`)
          break
        }
        
        offset += limit
      }
      
      const elapsed = Date.now() - startTime
      console.log(`[DirectDB] All tickers fetch completed in ${elapsed}ms`)
      console.log(`[DirectDB] Total tickers fetched successfully: ${allTickers.length}`)
      
      return allTickers
      
    } catch (error) {
      console.error('[DirectDB] getAllTickers failed:', error)
      
      // Fallback to static data only if direct HTTP also fails
      console.log('[DirectDB] Using static ticker data as fallback')
      const { staticTickers } = await import('./static-tickers')
      console.log(`[DirectDB] Fallback: ${staticTickers.length} static tickers loaded`)
      
      // Transform static data to match TickerMaster interface
      return staticTickers.map(ticker => ({
        id: ticker.symbol,
        symbol: ticker.symbol,
        name: ticker.name,
        company_name: ticker.company_name,
        market: ticker.market,
        sector: ticker.sector,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
    }
  }

  async getTickerBySymbol(symbol: string): Promise<TickerMaster | null> {
    try {
      const data = await this.request(`/ticker_master?select=*&symbol=eq.${symbol}&limit=1`)
      return data.length > 0 ? data[0] : null
    } catch (error) {
      console.error('[DirectDB] Error fetching ticker:', error)
      return null
    }
  }

  // 株価データ関連
  async getStockData(
    ticker: string, 
    timeframe: string, 
    limit?: number
  ): Promise<StockPrice[]> {
    console.log(`[DirectDB] Fetching stock data for ${ticker} ${timeframe}, limit: ${limit}`)
    
    try {
      // 4桁→5桁変換（末尾に0を追加）
      const fiveDigitTicker = ticker.length === 4 ? ticker + '0' : ticker
      console.log(`[DirectDB] Converting ${ticker} → ${fiveDigitTicker} for stock_prices lookup`)
      
      let endpoint = `/stock_prices?select=*&ticker=eq.${fiveDigitTicker}&timeframe=eq.${timeframe}&order=date.desc`
      if (limit) {
        endpoint += `&limit=${limit}`
      }

      let data = await this.request(endpoint)

      // 5桁で見つからない場合は、元の4桁コードでも検索
      if (data.length === 0 && ticker !== fiveDigitTicker) {
        console.log(`[DirectDB] No data found with ${fiveDigitTicker}, trying original ${ticker}`)
        
        let fallbackEndpoint = `/stock_prices?select=*&ticker=eq.${ticker}&timeframe=eq.${timeframe}&order=date.desc`
        if (limit) {
          fallbackEndpoint += `&limit=${limit}`
        }

        data = await this.request(fallbackEndpoint)
        console.log(`[DirectDB] Found ${data.length} records with original ticker ${ticker}`)
      }

      console.log(`[DirectDB] Retrieved ${data.length} records for ${ticker} ${timeframe}`)
      return data
      
    } catch (error) {
      console.error('[DirectDB] Error fetching stock data:', error)
      return []
    }
  }

  async getStockDataCount(ticker: string, timeframe: string): Promise<number> {
    try {
      console.log(`[DirectDB] Counting stock data for ${ticker} ${timeframe}`)
      
      // 4桁→5桁変換（末尾に0を追加）
      const fiveDigitTicker = ticker.length === 4 ? ticker + '0' : ticker
      console.log(`[DirectDB] Converting ${ticker} → ${fiveDigitTicker} for count lookup`)
      
      // Supabase REST APIで件数を取得するための正しい方法
      const response = await fetch(`${this.baseUrl}/stock_prices?select=*&ticker=eq.${fiveDigitTicker}&timeframe=eq.${timeframe}`, {
        method: 'HEAD',
        headers: {
          ...this.headers,
          'Prefer': 'count=exact'
        }
      })

      if (!response.ok) {
        // 5桁で見つからない場合は、元の4桁コードでも検索
        if (ticker !== fiveDigitTicker) {
          console.log(`[DirectDB] No count data found with ${fiveDigitTicker}, trying original ${ticker}`)
          const fallbackResponse = await fetch(`${this.baseUrl}/stock_prices?select=*&ticker=eq.${ticker}&timeframe=eq.${timeframe}`, {
            method: 'HEAD',
            headers: {
              ...this.headers,
              'Prefer': 'count=exact'
            }
          })
          
          if (fallbackResponse.ok) {
            const fallbackCount = fallbackResponse.headers.get('Content-Range')
            const fallbackResult = fallbackCount ? parseInt(fallbackCount.split('/')[1]) : 0
            console.log(`[DirectDB] Found count ${fallbackResult} with original ticker ${ticker}`)
            return fallbackResult
          }
        }
        
        console.error(`[DirectDB] Count request failed:`, response.status)
        return 0
      }

      // Content-Rangeヘッダーから件数を取得
      const contentRange = response.headers.get('Content-Range')
      const count = contentRange ? parseInt(contentRange.split('/')[1]) : 0
      
      console.log(`[DirectDB] Count result for ${ticker}: ${count}`)
      return count
      
    } catch (error) {
      console.error('[DirectDB] Error counting stock data:', error)
      return 0
    }
  }

  async getLatestStockPrice(ticker: string): Promise<StockPrice | null> {
    try {
      const data = await this.request(`/stock_prices?select=*&ticker=eq.${ticker}&timeframe=eq.1D&order=date.desc&limit=1`)
      return data.length > 0 ? data[0] : null
    } catch (error) {
      console.error('[DirectDB] Error fetching latest stock price:', error)
      return null
    }
  }

  // ウォッチリスト関連 - これらは認証が必要なので今は基本的な実装のみ
  async getFavorites(): Promise<Watchlist[]> {
    console.log('[DirectDB] Favorites require authentication - returning empty array')
    return []
  }

  // 簡単なお気に入り取得関数（App.tsxで使用）
  async getFavoritesSimple(_userId?: string): Promise<{ticker: string}[]> {
    console.log('[DirectDB] getFavoritesSimple - returning empty array (authentication required)')
    return []
  }

  async addToFavorites(_ticker: string, _name?: string): Promise<boolean> {
    console.log('[DirectDB] Add to favorites requires authentication - returning false')
    return false
  }

  async removeFromFavorites(_ticker: string): Promise<boolean> {
    console.log('[DirectDB] Remove from favorites requires authentication - returning false')
    return false
  }

  async isFavorite(_ticker: string): Promise<boolean> {
    console.log('[DirectDB] Check favorite requires authentication - returning false')
    return false
  }

  // メモ関連 - これらも認証が必要
  async getNotesByTicker(_ticker: string): Promise<Note[]> {
    console.log('[DirectDB] Notes require authentication - returning empty array')
    return []
  }

  async insertNote(_ticker: string, _text: string): Promise<Note | null> {
    console.log('[DirectDB] Insert note requires authentication - returning null')
    return null
  }

  async updateNote(_id: string, _text: string): Promise<Note | null> {
    console.log('[DirectDB] Update note requires authentication - returning null')
    return null
  }

  async deleteNote(_id: string): Promise<boolean> {
    console.log('[DirectDB] Delete note requires authentication - returning false')
    return false
  }

  // チャート描画関連 - これらも認証が必要
  async getChartDrawings(_ticker: string, _timeframe: string): Promise<ChartDrawing[]> {
    console.log('[DirectDB] Chart drawings require authentication - returning empty array')
    return []
  }

  async saveChartDrawing(
    _ticker: string,
    _timeframe: string,
    _type: string,
    _data: Record<string, any>
  ): Promise<ChartDrawing | null> {
    console.log('[DirectDB] Save chart drawing requires authentication - returning null')
    return null
  }

  async deleteChartDrawing(_id: string): Promise<boolean> {
    console.log('[DirectDB] Delete chart drawing requires authentication - returning false')
    return false
  }

  // リアルタイム購読は未実装
  subscribeToStockPrices(_ticker: string, _callback: (data: any) => void) {
    console.log('[DirectDB] Real-time subscriptions not implemented with direct HTTP')
    return { unsubscribe: () => {} }
  }

  subscribeToWatchlist(_callback: (data: any) => void) {
    console.log('[DirectDB] Real-time subscriptions not implemented with direct HTTP')
    return { unsubscribe: () => {} }
  }

  subscribeToChartDrawings(_ticker: string, _timeframe: string, _callback: (data: any) => void) {
    console.log('[DirectDB] Real-time subscriptions not implemented with direct HTTP')
    return { unsubscribe: () => {} }
  }
}

// シングルトンインスタンス
export const directDatabase = new DirectSupabaseDatabase()

// App.tsxで使用される関数のエクスポート
export const getFavoritesSimple = (userId?: string) => directDatabase.getFavoritesSimple(userId)