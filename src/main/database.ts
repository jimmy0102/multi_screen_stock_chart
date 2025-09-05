import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Ticker {
  id: number;
  symbol: string;
  name: string;
  market: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  ticker: string;
  timestamp: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface StockData {
  id: number;
  ticker: string;
  timestamp: string;
  timeframe: '60m' | '1D' | '1W' | '1M';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  created_at: string;
}

export interface FavoriteStock {
  ticker: string;
  created_at: string;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor() {
    // 開発環境では ./data フォルダを使用
    let dbPath: string;
    
    try {
      // Electron環境の場合
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
      
      if (isDev) {
        // 開発環境：プロジェクトルートのdataフォルダを使用
        dbPath = path.join(process.cwd(), 'data', 'stock_data.db');
      } else {
        // 本番環境：複数のパスを試す
        const possiblePaths = [
          // アプリケーションと同じディレクトリのdataフォルダ
          path.join(path.dirname(app.getPath('exe')), 'data', 'stock_data.db'),
          // resourcesフォルダ内のdataフォルダ
          path.join(process.resourcesPath, 'data', 'stock_data.db'),
          // アプリケーションの親ディレクトリのdataフォルダ
          path.join(path.dirname(app.getPath('exe')), '..', 'data', 'stock_data.db'),
          // ユーザーデータディレクトリ
          path.join(app.getPath('userData'), 'stock_data.db')
        ];
        
        // 存在するパスを探す
        dbPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[possiblePaths.length - 1];
        
        console.log('Checking paths:', possiblePaths);
        console.log('Selected path:', dbPath);
      }
    } catch (error) {
      // Node.js単体環境の場合（スクリプト実行時）
      dbPath = path.join(process.cwd(), 'data', 'stock_data.db');
    }
    
    console.log('Database path:', dbPath);
    console.log('Database file exists:', fs.existsSync(dbPath));
    
    // データベースディレクトリが存在しない場合は作成
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      console.log('Creating database directory:', dbDir);
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase() {
    // Tickers table - 東証プライム銘柄一覧
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        market TEXT DEFAULT 'Prime',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock data table - OHLCV データ
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        timeframe TEXT NOT NULL CHECK (timeframe IN ('60m', '1D', '1W', '1M')),
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticker, timestamp, timeframe)
      )
    `);

    // Notes table - メモ機能
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Favorites table - お気に入り銘柄
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        ticker TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // インデックスの作成
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_data_ticker_timeframe 
      ON stock_data(ticker, timeframe);
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_data_timestamp 
      ON stock_data(timestamp);
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_ticker 
      ON notes(ticker);
    `);
    
    // データベースが空の場合、サンプルデータを挿入
    this.initializeSampleDataIfEmpty().catch(console.error);
  }

  // Ticker operations
  insertTickers(tickers: Array<{symbol: string, name: string, market?: string}>) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tickers (symbol, name, market, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const insertMany = this.db.transaction((tickerList: Array<{symbol: string, name: string, market?: string}>) => {
      for (const ticker of tickerList) {
        stmt.run(ticker.symbol, ticker.name, ticker.market || 'Prime');
      }
    });
    
    insertMany(tickers);
  }

  getAllTickers(): Ticker[] {
    try {
      const result = this.db.prepare('SELECT * FROM tickers ORDER BY symbol').all() as Ticker[];
      console.log('Found tickers:', result.length);
      return result;
    } catch (error) {
      console.error('Error fetching tickers:', error);
      return [];
    }
  }

  // Stock data operations
  insertStockData(data: Array<Omit<StockData, 'id' | 'created_at'>>) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stock_data 
      (ticker, timestamp, timeframe, open, high, low, close, volume) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = this.db.transaction((dataList: Array<Omit<StockData, 'id' | 'created_at'>>) => {
      for (const item of dataList) {
        stmt.run(
          item.ticker, 
          item.timestamp, 
          item.timeframe, 
          item.open, 
          item.high, 
          item.low, 
          item.close, 
          item.volume
        );
      }
    });
    
    insertMany(data);
  }

  getStockData(ticker: string, timeframe: string, limit?: number): StockData[] {
    // 初回は全データを取得、その後は制限を適用
    if (limit === undefined) {
      // 全データを取得（初回キャッシュ用）
      return this.db.prepare(`
        SELECT * FROM stock_data 
        WHERE ticker = ? AND timeframe = ? 
        ORDER BY timestamp ASC
      `).all(ticker, timeframe) as StockData[];
    } else {
      // 制限された件数で最新データを取得
      return this.db.prepare(`
        SELECT * FROM stock_data 
        WHERE ticker = ? AND timeframe = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(ticker, timeframe, limit) as StockData[];
    }
  }

  // 日付範囲指定でのデータ取得（ズーム・パン時用）
  getStockDataByDateRange(ticker: string, timeframe: string, fromDate: string, toDate: string): StockData[] {
    return this.db.prepare(`
      SELECT * FROM stock_data 
      WHERE ticker = ? AND timeframe = ? 
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(ticker, timeframe, fromDate, toDate) as StockData[];
  }

  // データ件数取得（キャッシュ判定用）
  getStockDataCount(ticker: string, timeframe: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM stock_data 
      WHERE ticker = ? AND timeframe = ?
    `).get(ticker, timeframe) as { count: number };
    return result.count;
  }

  // Notes operations
  insertNote(ticker: string, text: string): Note {
    const stmt = this.db.prepare(`
      INSERT INTO notes (ticker, timestamp, text) 
      VALUES (?, CURRENT_TIMESTAMP, ?)
    `);
    
    const result = stmt.run(ticker, text);
    
    return this.db.prepare('SELECT * FROM notes WHERE id = ?')
      .get(result.lastInsertRowid) as Note;
  }

  updateNote(id: number, text: string): void {
    this.db.prepare(`
      UPDATE notes 
      SET text = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(text, id);
  }

  getNotesByTicker(ticker: string): Note[] {
    return this.db.prepare(`
      SELECT * FROM notes 
      WHERE ticker = ? 
      ORDER BY created_at DESC
    `).all(ticker) as Note[];
  }

  // Favorites operations
  addToFavorites(ticker: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO favorites (ticker) 
      VALUES (?)
    `).run(ticker);
  }

  removeFromFavorites(ticker: string): void {
    this.db.prepare('DELETE FROM favorites WHERE ticker = ?').run(ticker);
  }

  getFavorites(): FavoriteStock[] {
    return this.db.prepare(`
      SELECT * FROM favorites 
      ORDER BY created_at DESC
    `).all() as FavoriteStock[];
  }

  isFavorite(ticker: string): boolean {
    const result = this.db.prepare('SELECT 1 FROM favorites WHERE ticker = ?').get(ticker);
    return !!result;
  }

  private async initializeSampleDataIfEmpty() {
    const tickerCount = this.db.prepare('SELECT COUNT(*) as count FROM tickers').get() as { count: number };
    
    if (tickerCount.count === 0) {
      console.log('Database is empty, trying to fetch real ticker data...');
      
      // J-Quants APIで動的に銘柄リストを取得
      try {
        const { JQuantsClient } = await import('./jquants-client');
        const jquantsClient = new JQuantsClient();
        const success = await jquantsClient.updateTickerDatabase(this);
        
        if (success) {
          const tickerCountAfter = this.db.prepare('SELECT COUNT(*) as count FROM tickers').get() as { count: number };
          if (tickerCountAfter.count > 0) {
            console.log(`Real ticker data loaded successfully from J-Quants: ${tickerCountAfter.count} tickers`);
            return; // サンプルデータは生成しない
          }
        }
      } catch (error) {
        console.log('J-Quants API failed:', error);
      }
      
      // フォールバック: 確実にサンプル銘柄を保存
      console.log('Loading fallback ticker data...');
      const { fetchTSEPrimeTickers } = await import('./ticker-fetcher');
      const sampleTickers = await fetchTSEPrimeTickers();
      
      if (sampleTickers && sampleTickers.length > 0) {
        this.insertTickers(sampleTickers);
        console.log(`Fallback ticker data inserted: ${sampleTickers.length} tickers`);
      } else {
        console.error('Failed to load even fallback ticker data!');
      }
    }
  }
  
  private generateSimpleStockData(symbol: string) {
    const data = [];
    const basePrice = Math.floor(Math.random() * 3000) + 1000;
    let currentPrice = basePrice;
    
    // 過去100日分のデータを生成
    for (let i = 99; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // 価格の連続性を保つ
      const change = (Math.random() - 0.5) * 0.05; // ±2.5%の変動
      const open = currentPrice;
      const close = Math.max(100, currentPrice * (1 + change));
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      
      // 日足データ
      data.push({
        ticker: symbol,
        timestamp: date.toISOString().split('T')[0] + ' 15:00:00',
        timeframe: '1D' as const,
        open: Math.round(open),
        high: Math.round(high),
        low: Math.round(low),
        close: Math.round(close),
        volume
      });
      
      // 週足データ（毎週金曜日または最終取引日）
      const isWeekEnd = date.getDay() === 5 || 
                       (i === 0) || // 最終日
                       (i < 99 && new Date(Date.now() - (i-1) * 24*60*60*1000).getDay() === 1); // 次が月曜
      
      if (isWeekEnd) {
        data.push({
          ticker: symbol,
          timestamp: date.toISOString().split('T')[0] + ' 15:00:00',
          timeframe: '1W' as const,
          open: Math.round(open),
          high: Math.round(high),
          low: Math.round(low),
          close: Math.round(close),
          volume: volume * 5
        });
      }
      
      // 月足データ（月末または最終日）
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      const isMonthEnd = nextDay.getMonth() !== date.getMonth() || i === 0;
      
      if (isMonthEnd) {
        data.push({
          ticker: symbol,
          timestamp: date.toISOString().split('T')[0] + ' 15:00:00',
          timeframe: '1M' as const,
          open: Math.round(open),
          high: Math.round(high),
          low: Math.round(low),
          close: Math.round(close),
          volume: volume * 20
        });
      }
      
      // 60分足データ（直近5日分のみ）
      if (i < 5) {
        for (let hour = 9; hour < 17; hour++) {
          const hourDate = new Date(date);
          hourDate.setHours(hour, 0, 0, 0);
          
          const hourChange = (Math.random() - 0.5) * 0.01; // ±0.5%の変動
          const hourOpen = currentPrice;
          const hourClose = Math.max(100, currentPrice * (1 + hourChange));
          const hourHigh = Math.max(hourOpen, hourClose) * (1 + Math.random() * 0.005);
          const hourLow = Math.min(hourOpen, hourClose) * (1 - Math.random() * 0.005);
          
          data.push({
            ticker: symbol,
            timestamp: hourDate.toISOString().replace('T', ' ').split('.')[0],
            timeframe: '60m' as const,
            open: Math.round(hourOpen),
            high: Math.round(hourHigh),
            low: Math.round(hourLow),
            close: Math.round(hourClose),
            volume: Math.floor(volume / 8)
          });
          
          currentPrice = hourClose;
        }
      }
      
      currentPrice = close;
    }
    
    return data;
  }

  close() {
    this.db.close();
  }
}