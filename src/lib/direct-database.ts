// Direct HTTP implementation to bypass Supabase JavaScript library
import type { TickerMaster, StockPrice, Watchlist, ChartDrawing, Note } from './supabase'
import type { HorizontalLineSettings } from './types'

const DEFAULT_HORIZONTAL_SETTINGS: HorizontalLineSettings = {
  color: '#FF0000',
  width: 3
}

const LINE_STORAGE_KEY = 'horizontalLinesByUser';
const LEGACY_LINE_STORAGE_KEY = 'horizontalLines';

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

  private getUserKey(userId?: string) {
    return userId || 'guest'
  }

  private loadHorizontalLineStore(): Record<string, Record<string, ChartDrawing[]>> {
    try {
      const stored = localStorage.getItem(LINE_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }

      const legacy = localStorage.getItem(LEGACY_LINE_STORAGE_KEY)
      if (legacy) {
        const legacyData = JSON.parse(legacy)
        const migrated = { guest: legacyData }
        localStorage.setItem(LINE_STORAGE_KEY, JSON.stringify(migrated))
        try {
          localStorage.removeItem(LEGACY_LINE_STORAGE_KEY)
        } catch (error) {
          console.warn('[DirectDB] Failed to remove legacy horizontal line store:', error)
        }
        return migrated
      }
    } catch (error) {
      console.error('[DirectDB] Failed to load horizontal line store:', error)
    }

    return {}
  }

  private saveHorizontalLineStore(store: Record<string, Record<string, ChartDrawing[]>>) {
    localStorage.setItem(LINE_STORAGE_KEY, JSON.stringify(store))
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
      
      // No fallback data available
      console.log('[DirectDB] No ticker data available')
      return []
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
      console.log(`[DirectDB] Converting ${ticker} → ${fiveDigitTicker} for stock_prices_all lookup`)
      
      let endpoint = `/stock_prices_all?select=*&ticker=eq.${fiveDigitTicker}&timeframe=eq.${timeframe}&order=date.desc`
      if (limit) {
        endpoint += `&limit=${limit}`
      }

      let data = await this.request(endpoint)

      // 5桁で見つからない場合は、元の4桁コードでも検索
      if (data.length === 0 && ticker !== fiveDigitTicker) {
        console.log(`[DirectDB] No data found with ${fiveDigitTicker}, trying original ${ticker}`)
        
        let fallbackEndpoint = `/stock_prices_all?select=*&ticker=eq.${ticker}&timeframe=eq.${timeframe}&order=date.desc`
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
      const response = await fetch(`${this.baseUrl}/stock_prices_all?select=*&ticker=eq.${fiveDigitTicker}&timeframe=eq.${timeframe}`, {
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
          const fallbackResponse = await fetch(`${this.baseUrl}/stock_prices_all?select=*&ticker=eq.${ticker}&timeframe=eq.${timeframe}`, {
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
      const data = await this.request(`/stock_prices_all?select=*&ticker=eq.${ticker}&timeframe=eq.1D&order=date.desc&limit=1`)
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

  // チャート描画関連 - ローカルストレージ実装
  async getChartDrawings(ticker: string, _timeframe: string, userId?: string): Promise<ChartDrawing[]> {
    try {
      const allLines = this.loadHorizontalLineStore()
      const userKey = this.getUserKey(userId)
      const tickerLines = allLines[userKey]?.[ticker] || []

      return tickerLines.map((line: any) => ({
        ...line,
        ticker,
        timeframe: _timeframe,
        type: 'horizontal_line',
        user_id: line.user_id || userKey,
        data: {
          color: line.data?.color ?? DEFAULT_HORIZONTAL_SETTINGS.color,
          width: Number.isFinite(line.data?.width) ? Number(line.data.width) : DEFAULT_HORIZONTAL_SETTINGS.width,
          price: line.data?.price
        }
      }))
    } catch (error) {
      console.error('[DirectDB] Error loading horizontal lines:', error)
      return []
    }
  }

  async saveChartDrawing(
    ticker: string,
    _timeframe: string,
    type: string,
    data: Record<string, any>,
    userId?: string
  ): Promise<ChartDrawing | null> {
    if (type !== 'horizontal_line') {
      console.log('[DirectDB] Only horizontal_line type is supported')
      return null
    }

    try {
      const allLines = this.loadHorizontalLineStore()
      const userKey = this.getUserKey(userId)

      if (!allLines[userKey]) {
        allLines[userKey] = {}
      }

      if (!allLines[userKey][ticker]) {
        allLines[userKey][ticker] = []
      }

      const newLine: ChartDrawing = {
        id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        ticker,
        timeframe: '1D' as any,
        type: 'horizontal_line',
        data: {
          color: data.color ?? DEFAULT_HORIZONTAL_SETTINGS.color,
          width: Number.isFinite(data.width) ? Number(data.width) : DEFAULT_HORIZONTAL_SETTINGS.width,
          price: data.price
        },
        user_id: userKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      allLines[userKey][ticker].push(newLine)
      this.saveHorizontalLineStore(allLines)

      console.log('[DirectDB] Saved horizontal line:', newLine)
      return newLine
    } catch (error) {
      console.error('[DirectDB] Error saving horizontal line:', error)
      return null
    }
  }

  async updateChartDrawing(
    id: string,
    updates: Partial<Record<'price' | 'color' | 'width', any>>,
    userId?: string
  ): Promise<ChartDrawing | null> {
    try {
      const allLines = this.loadHorizontalLineStore()
      const userKey = this.getUserKey(userId)
      if (!allLines[userKey]) {
        return null
      }

      let updated: ChartDrawing | null = null

      for (const ticker of Object.keys(allLines[userKey])) {
        const lines: ChartDrawing[] = allLines[userKey][ticker]
        const index = lines.findIndex((line: ChartDrawing) => line.id === id)
        if (index === -1) continue

        const target = lines[index]
        const nextData = {
          ...target.data,
          ...('price' in updates ? { price: updates.price } : {}),
          ...('color' in updates ? { color: updates.color } : {}),
          ...('width' in updates ? { width: updates.width } : {})
        }

        const merged: ChartDrawing = {
          ...target,
          data: {
            color: nextData.color ?? DEFAULT_HORIZONTAL_SETTINGS.color,
            width: Number.isFinite(nextData.width) ? Number(nextData.width) : DEFAULT_HORIZONTAL_SETTINGS.width,
            price: nextData.price
          },
          updated_at: new Date().toISOString()
        }

        lines[index] = merged
        updated = { ...merged, ticker }
        break
      }

      if (updated) {
        this.saveHorizontalLineStore(allLines)
        console.log('[DirectDB] Updated horizontal line:', updated.id)
      }

      return updated
    } catch (error) {
      console.error('[DirectDB] Error updating horizontal line:', error)
      return null
    }
  }

  async deleteChartDrawing(id: string, userId?: string): Promise<boolean> {
    try {
      const allLines = this.loadHorizontalLineStore()
      const userKey = this.getUserKey(userId)
      if (!allLines[userKey]) return false

      for (const ticker in allLines[userKey]) {
        const lines = allLines[userKey][ticker]
        const index = lines.findIndex((line: any) => line.id === id)
        if (index !== -1) {
          lines.splice(index, 1)
          if (lines.length === 0) {
            delete allLines[userKey][ticker]
          }
          this.saveHorizontalLineStore(allLines)
          console.log('[DirectDB] Deleted horizontal line:', id)
          return true
        }
      }

      return false
    } catch (error) {
      console.error('[DirectDB] Error deleting horizontal line:', error)
      return false
    }
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

  async getHorizontalLineSettings(userId?: string): Promise<HorizontalLineSettings> {
    try {
      const key = userId || 'guest'
      const stored = localStorage.getItem('horizontalLineSettings')
      if (!stored) {
        return { ...DEFAULT_HORIZONTAL_SETTINGS }
      }

      const allSettings = JSON.parse(stored)
      const settings = allSettings[key]
      if (!settings) {
        return { ...DEFAULT_HORIZONTAL_SETTINGS }
      }

      return {
        color: typeof settings.color === 'string' ? settings.color : DEFAULT_HORIZONTAL_SETTINGS.color,
        width: Number.isFinite(settings.width) ? Number(settings.width) : DEFAULT_HORIZONTAL_SETTINGS.width
      }
    } catch (error) {
      console.error('[DirectDB] Error loading horizontal line settings:', error)
      return { ...DEFAULT_HORIZONTAL_SETTINGS }
    }
  }

  async saveHorizontalLineSettings(
    userId: string | undefined,
    settings: HorizontalLineSettings
  ): Promise<HorizontalLineSettings> {
    try {
      const key = userId || 'guest'
      const stored = localStorage.getItem('horizontalLineSettings')
      const allSettings = stored ? JSON.parse(stored) : {}

      allSettings[key] = {
        color: settings.color,
        width: Number(settings.width)
      }

      localStorage.setItem('horizontalLineSettings', JSON.stringify(allSettings))
      console.log('[DirectDB] Saved horizontal line settings for', key, settings)
      return {
        color: settings.color,
        width: Number(settings.width)
      }
    } catch (error) {
      console.error('[DirectDB] Error saving horizontal line settings:', error)
      return { ...DEFAULT_HORIZONTAL_SETTINGS }
    }
  }
}

// シングルトンインスタンス
export const directDatabase = new DirectSupabaseDatabase()

// App.tsxで使用される関数のエクスポート
export const getFavoritesSimple = (userId?: string) => directDatabase.getFavoritesSimple(userId)
