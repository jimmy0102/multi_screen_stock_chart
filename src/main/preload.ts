import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Ticker operations
  getAllTickers: () => Promise<any[]>;
  insertTickers: (tickers: any[]) => Promise<void>;
  updateTickerList: () => Promise<boolean>;
  
  // Stock data operations
  getStockData: (ticker: string, timeframe: string, limit?: number) => Promise<any[]>;
  insertStockData: (data: any[]) => Promise<void>;
  updateStockData: (ticker: string) => Promise<boolean>;
  
  // Notes operations
  getNotes: (ticker: string) => Promise<any[]>;
  insertNote: (ticker: string, text: string) => Promise<any>;
  updateNote: (id: number, text: string) => Promise<void>;
  
  // Favorites operations
  getFavorites: () => Promise<any[]>;
  addToFavorites: (ticker: string) => Promise<void>;
  removeFromFavorites: (ticker: string) => Promise<void>;
  isFavorite: (ticker: string) => Promise<boolean>;
  
  // App operations
  getAppVersion: () => Promise<string>;
  quitApp: () => Promise<void>;
}

const electronAPI: ElectronAPI = {
  // Ticker operations
  getAllTickers: () => ipcRenderer.invoke('get-all-tickers'),
  insertTickers: (tickers) => ipcRenderer.invoke('insert-tickers', tickers),
  updateTickerList: () => ipcRenderer.invoke('update-ticker-list'),
  
  // Stock data operations
  getStockData: (ticker, timeframe, limit) => ipcRenderer.invoke('get-stock-data', ticker, timeframe, limit),
  insertStockData: (data) => ipcRenderer.invoke('insert-stock-data', data),
  updateStockData: (ticker) => ipcRenderer.invoke('update-stock-data', ticker),
  
  // Notes operations
  getNotes: (ticker) => ipcRenderer.invoke('get-notes', ticker),
  insertNote: (ticker, text) => ipcRenderer.invoke('insert-note', ticker, text),
  updateNote: (id, text) => ipcRenderer.invoke('update-note', id, text),
  
  // Favorites operations
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  addToFavorites: (ticker) => ipcRenderer.invoke('add-to-favorites', ticker),
  removeFromFavorites: (ticker) => ipcRenderer.invoke('remove-from-favorites', ticker),
  isFavorite: (ticker) => ipcRenderer.invoke('is-favorite', ticker),
  
  // App operations
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  quitApp: () => ipcRenderer.invoke('app-quit')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}