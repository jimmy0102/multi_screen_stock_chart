export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  market: string;
  sector?: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  ticker: string;
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

export interface ChartData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartOptions {
  width: number;
  height: number;
  layout: {
    background: {
      color: string;
    };
    textColor: string;
  };
  grid: {
    vertLines: {
      color: string;
    };
    horzLines: {
      color: string;
    };
  };
  crosshair: {
    mode: number;
  };
  rightPriceScale: {
    borderColor: string;
  };
  timeScale: {
    borderColor: string;
    timeVisible: boolean;
    secondsVisible: boolean;
  };
}

export type TimeFrame = '60m' | '1D' | '1W' | '1M';

// ウォッチリストレベル定義
export type WatchlistLevel = 0 | 1 | 2 | 3; // 0=なし, 1=銅, 2=銀, 3=金

// フィルター状態定義
export type FilterState = 'all' | 'bronze' | 'silver' | 'gold';

export interface AppState {
  currentTicker: string;
  currentIndex: number;
  tickers: Ticker[];
  favorites: string[]; // 後方互換性のため残す（使用は watchlistLevels に移行）
  watchlistLevels: Record<string, WatchlistLevel>; // ticker -> level
  currentFilter: FilterState;
  showFavoritesOnly: boolean; // 後方互換性のため残す
  notes: Record<string, Note[]>;
}

export interface KeyboardShortcuts {
  'ArrowUp': () => void;
  'ArrowDown': () => void;
  'ArrowLeft': () => void;   // フィルター：前へ
  'ArrowRight': () => void;  // フィルター：次へ
  'Shift+ArrowUp': () => void;
  'Shift+ArrowDown': () => void;
  'PageUp': () => void;
  'PageDown': () => void;
  'Space': () => void;       // 現在のフィルターでの表示切替
  'Enter': () => void;       // レベル順次アップ
  'Tab': () => void;
  'Escape': () => void;
  '0': () => void;          // ウォッチリスト削除
  '1': () => void;          // 銅レベル設定
  '2': () => void;          // 銀レベル設定
  '3': () => void;          // 金レベル設定
  'h': () => void;          // 水平線モード切替
  'H': () => void;          // 水平線モード切替（大文字）
}
