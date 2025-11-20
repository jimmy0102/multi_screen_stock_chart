import { directDatabase } from './direct-database'
import type { 
  StockPrice, 
  TickerMaster, 
  Watchlist, 
  ChartDrawing, 
  Note 
} from './supabase'
import type { HorizontalLineSettings } from './types'
export type { HorizontalLineSettings } from './types'

export class SupabaseDatabase {
  // 銘柄関連
  async getAllTickers(): Promise<TickerMaster[]> {
    console.log('[Database] Using direct HTTP approach to bypass Supabase library...')
    return await directDatabase.getAllTickers()
  }

  async getTickerBySymbol(symbol: string): Promise<TickerMaster | null> {
    return await directDatabase.getTickerBySymbol(symbol)
  }

  // 株価データ関連
  async getStockData(
    ticker: string, 
    timeframe: string, 
    limit?: number
  ): Promise<StockPrice[]> {
    return await directDatabase.getStockData(ticker, timeframe, limit)
  }

  async getStockDataCount(ticker: string, timeframe: string): Promise<number> {
    return await directDatabase.getStockDataCount(ticker, timeframe)
  }

  async getLatestStockPrice(ticker: string): Promise<StockPrice | null> {
    return await directDatabase.getLatestStockPrice(ticker)
  }

  // ウォッチリスト関連
  async getFavorites(): Promise<Watchlist[]> {
    return await directDatabase.getFavorites()
  }

  async addToFavorites(ticker: string, name?: string): Promise<boolean> {
    return await directDatabase.addToFavorites(ticker, name)
  }

  async removeFromFavorites(ticker: string): Promise<boolean> {
    return await directDatabase.removeFromFavorites(ticker)
  }

  async isFavorite(ticker: string): Promise<boolean> {
    return await directDatabase.isFavorite(ticker)
  }

  // メモ関連
  async getNotesByTicker(ticker: string): Promise<Note[]> {
    return await directDatabase.getNotesByTicker(ticker)
  }

  async insertNote(ticker: string, text: string): Promise<Note | null> {
    return await directDatabase.insertNote(ticker, text)
  }

  async updateNote(id: string, text: string): Promise<Note | null> {
    return await directDatabase.updateNote(id, text)
  }

  async deleteNote(id: string): Promise<boolean> {
    return await directDatabase.deleteNote(id)
  }

  // チャート描画関連
  async getChartDrawings(ticker: string, timeframe: string, userId?: string): Promise<ChartDrawing[]> {
    return await directDatabase.getChartDrawings(ticker, timeframe, userId)
  }

  async saveChartDrawing(
    ticker: string,
    timeframe: string,
    type: string,
    data: Record<string, any>,
    userId?: string
  ): Promise<ChartDrawing | null> {
    return await directDatabase.saveChartDrawing(ticker, timeframe, type, data, userId)
  }

  async updateChartDrawing(
    id: string,
    data: Partial<Record<'price' | 'color' | 'width', any>>,
    userId?: string
  ): Promise<ChartDrawing | null> {
    return await directDatabase.updateChartDrawing(id, data, userId)
  }

  async deleteChartDrawing(id: string, userId?: string): Promise<boolean> {
    return await directDatabase.deleteChartDrawing(id, userId)
  }

  async getHorizontalLineSettings(userId?: string): Promise<HorizontalLineSettings> {
    return await directDatabase.getHorizontalLineSettings(userId)
  }

  async saveHorizontalLineSettings(
    userId: string | undefined,
    settings: HorizontalLineSettings
  ): Promise<HorizontalLineSettings> {
    return await directDatabase.saveHorizontalLineSettings(userId, settings)
  }

  // リアルタイム購読
  subscribeToStockPrices(ticker: string, callback: (data: any) => void) {
    return directDatabase.subscribeToStockPrices(ticker, callback)
  }

  subscribeToWatchlist(callback: (data: any) => void) {
    return directDatabase.subscribeToWatchlist(callback)
  }

  subscribeToChartDrawings(ticker: string, timeframe: string, callback: (data: any) => void) {
    return directDatabase.subscribeToChartDrawings(ticker, timeframe, callback)
  }
}

// シングルトンインスタンス
export const database = new SupabaseDatabase()
