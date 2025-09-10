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

  // 特定の銘柄・時間枠のデータをクリア
  clearStockData(ticker: string, timeframe: string): void {
    this.db.prepare(`
      DELETE FROM stock_data 
      WHERE ticker = ? AND timeframe = ?
    `).run(ticker, timeframe);
  }

  // 5桁コードのティッカーを削除（Twelve Data時代の古いデータ清掃用）
  clearLegacyFiveDigitTickers(): void {
    const deletedTickers = this.db.prepare(`
      DELETE FROM tickers 
      WHERE length(symbol) = 5 AND symbol LIKE '%0'
    `).run();
    console.log(`Cleared ${deletedTickers.changes} legacy 5-digit tickers`);
  }

  // 5桁コードの株価データを削除
  clearLegacyFiveDigitStockData(): void {
    const deletedData = this.db.prepare(`
      DELETE FROM stock_data 
      WHERE length(ticker) = 5 AND ticker LIKE '%0'
    `).run();
    console.log(`Cleared ${deletedData.changes} legacy 5-digit stock data records`);
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

  

  close() {
    this.db.close();
  }
}