import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DatabaseManager } from './database';
import { TwelveDataClient } from './twelve-data-client';
import { JQuantsClient } from './jquants-client';
import * as dotenv from 'dotenv';

dotenv.config();

class StockChartApp {
  private mainWindow: BrowserWindow | null = null;
  private db: DatabaseManager;

  constructor() {
    this.db = new DatabaseManager();
    this.initializeApp();
  }

  private initializeApp() {
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupIpcHandlers();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      titleBarStyle: 'default',
      show: false
    });

    // 開発環境かプロダクション環境かで読み込むファイルを分ける
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupIpcHandlers() {
    // Ticker operations
    ipcMain.handle('get-all-tickers', async () => {
      console.log('IPC: get-all-tickers called');
      let tickers = this.db.getAllTickers();
      
      // 銘柄リストが空の場合は更新
      if (!tickers || tickers.length === 0) {
        console.log('No tickers found, updating from J-Quants...');
        const jquantsClient = new JQuantsClient();
        await jquantsClient.updateTickerDatabase(this.db);
        tickers = this.db.getAllTickers();
      }
      
      console.log('IPC: returning tickers:', tickers.length);
      return tickers;
    });

    ipcMain.handle('insert-tickers', async (_, tickers) => {
      return this.db.insertTickers(tickers);
    });

    // Stock data operations
    ipcMain.handle('get-stock-data', async (_, ticker: string, timeframe: string, limit?: number) => {
      // データの存在チェック
      const dataCount = this.db.getStockDataCount(ticker, timeframe);
      let data = this.db.getStockData(ticker, timeframe, limit);
      
      // データが存在しない場合のみ新規取得（キャッシュクリア後の初回取得）
      const shouldRefresh = dataCount === 0;
      
      if (shouldRefresh) {
        console.log(`No data found for ${ticker} ${timeframe}. Fetching fresh JPY data...`);
        const twelveDataClient = new TwelveDataClient();
        const success = await twelveDataClient.fetchAndStoreStockData(ticker);
        twelveDataClient.close();
        
        if (success) {
          // 新しい円建てデータを取得
          data = this.db.getStockData(ticker, timeframe, limit);
          console.log(`Freshly cached ${data.length} JPY data points for ${ticker} ${timeframe}`);
        } else {
          console.warn(`Failed to fetch data for ${ticker} ${timeframe}`);
          return [];
        }
      } else {
        console.log(`Using cached JPY data for ${ticker} ${timeframe} (${data.length} points)`);
      }
      
      return data || [];
    });

    ipcMain.handle('insert-stock-data', async (_, data) => {
      return this.db.insertStockData(data);
    });
    
    // API operations
    ipcMain.handle('update-ticker-list', async () => {
      const jquantsClient = new JQuantsClient();
      const success = await jquantsClient.updateTickerDatabase(this.db);
      return success;
    });
    
    ipcMain.handle('update-stock-data', async (_, ticker: string) => {
      const twelveDataClient = new TwelveDataClient();
      const success = await twelveDataClient.fetchAndStoreStockData(ticker);
      twelveDataClient.close();
      return success;
    });

    // Notes operations
    ipcMain.handle('get-notes', async (_, ticker: string) => {
      return this.db.getNotesByTicker(ticker);
    });

    ipcMain.handle('insert-note', async (_, ticker: string, text: string) => {
      return this.db.insertNote(ticker, text);
    });

    ipcMain.handle('update-note', async (_, id: number, text: string) => {
      return this.db.updateNote(id, text);
    });

    // Favorites operations
    ipcMain.handle('get-favorites', async () => {
      return this.db.getFavorites();
    });

    ipcMain.handle('add-to-favorites', async (_, ticker: string) => {
      return this.db.addToFavorites(ticker);
    });

    ipcMain.handle('remove-from-favorites', async (_, ticker: string) => {
      return this.db.removeFromFavorites(ticker);
    });

    ipcMain.handle('is-favorite', async (_, ticker: string) => {
      return this.db.isFavorite(ticker);
    });

    // App operations
    ipcMain.handle('app-version', async () => {
      return app.getVersion();
    });

    ipcMain.handle('app-quit', async () => {
      app.quit();
    });
  }

  private cleanup() {
    this.db.close();
  }
}

new StockChartApp();