import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'path';
import { DatabaseManager } from './database';
import { JQuantsClient } from './jquants-client';
import * as dotenv from 'dotenv';

dotenv.config();

class StockChartApp {
  private mainWindow: BrowserWindow | null = null;
  private db: DatabaseManager;
  private fetchQueue: Set<string> = new Set();
  private isProcessingQueue: boolean = false;

  constructor() {
    this.db = new DatabaseManager();
    this.initializeApp();
  }

  private initializeApp() {
    // カスタムプロトコルを登録
    app.setAsDefaultProtocolClient('multiscreenstockchart');
    
    app.whenReady().then(() => {
      Menu.setApplicationMenu(null);
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

    // カスタムプロトコルでアプリが開かれた時の処理（Windows/Linux）
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // OAuth認証のリダイレクトを検出
      const url = commandLine.find(arg => arg.startsWith('multiscreenstockchart://'));
      if (url) {
        console.log('[Main] Custom protocol URL received:', url);
        this.handleOAuthCallback(url);
      }
      
      // ウィンドウを前面に表示
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });

    // macOS でカスタムプロトコルが開かれた時の処理
    app.on('open-url', (event, url) => {
      event.preventDefault();
      console.log('[Main] Custom protocol URL received (macOS):', url);
      this.handleOAuthCallback(url);
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

    // 外部リンクを既定のブラウザで開く（OAuth認証用）
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      console.log('[Main] Opening external URL:', url);
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // OAuth認証のコールバックURLを監視
    this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      console.log('[Main] Navigation intercepted:', navigationUrl);
      
      // Supabaseの認証コールバックかチェック
      if (parsedUrl.origin === 'https://yuzgwwnecgvulsrqbxng.supabase.co' && 
          parsedUrl.pathname === '/auth/v1/callback') {
        console.log('[Main] OAuth callback detected, processing...');
        
        // フラグメントにアクセストークンが含まれている場合
        const hash = parsedUrl.hash;
        if (hash) {
          console.log('[Main] Found hash in callback URL, sending to renderer...');
          this.mainWindow?.webContents.send('oauth-callback', navigationUrl);
        }
      }
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
      const data = this.db.getStockData(ticker, timeframe, limit);
      
      // データが存在しない場合のみ新規取得
      const shouldRefresh = dataCount === 0;
      
      if (shouldRefresh) {
        console.log(`No data found for ${ticker} ${timeframe}. Adding to fetch queue...`);
        
        // すぐにはAPIを呼ばず、後で一括取得するためのキューに追加
        this.addToFetchQueue(ticker);
        
        // 現時点では空配列を返すか、代替データを返す
        return [];
      } else {
        console.log(`Using cached data for ${ticker} ${timeframe} (${data.length} points)`);
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
      const jquantsClient = new JQuantsClient();
      const success = await jquantsClient.fetchAndStoreStockData(ticker, this.db);
      jquantsClient.close();
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

  private addToFetchQueue(ticker: string) {
    this.fetchQueue.add(ticker);
    
    // 少し遅延させてから処理開始（複数の銘柄が一度にリクエストされる場合をまとめるため）
    setTimeout(() => {
      this.processFetchQueue();
    }, 2000);
  }

  private async processFetchQueue() {
    if (this.isProcessingQueue || this.fetchQueue.size === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`Processing fetch queue: ${this.fetchQueue.size} tickers`);

    const jquantsClient = new JQuantsClient();
    const tickersToFetch = Array.from(this.fetchQueue);
    this.fetchQueue.clear();

    // 1つずつ順番に処理（レート制限を考慮）
    for (const ticker of tickersToFetch) {
      try {
        console.log(`Fetching data for ${ticker}...`);
        const success = await jquantsClient.fetchAndStoreStockData(ticker, this.db);
        
        if (success) {
          // データが取得できたらフロントエンドに通知
          this.mainWindow?.webContents.send('data-updated', ticker);
        }
        
        // レート制限を避けるため、リクエスト間に2秒の間隔
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Failed to fetch data for ${ticker}:`, error);
      }
    }

    jquantsClient.close();
    this.isProcessingQueue = false;
    
    // 処理中に新しいリクエストが追加された場合は再処理
    if (this.fetchQueue.size > 0) {
      setTimeout(() => this.processFetchQueue(), 1000);
    }
  }

  private handleOAuthCallback(url: string) {
    console.log('[Main] Processing OAuth callback URL:', url);
    
    try {
      const urlObj = new URL(url);
      console.log('[Main] OAuth callback received:', {
        protocol: urlObj.protocol,
        pathname: urlObj.pathname,
        hash: urlObj.hash ? 'present' : 'missing',
        search: urlObj.search ? 'present' : 'missing'
      });
      
      // レンダラープロセスにOAuth完了を通知
      this.mainWindow?.webContents.send('oauth-callback', url);
      
      // ウィンドウを前面に表示
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
        this.mainWindow.show();
      }
      
    } catch (error) {
      console.error('[Main] Error parsing OAuth callback URL:', error);
    }
  }

  private cleanup() {
    this.db.close();
  }
}

new StockChartApp();