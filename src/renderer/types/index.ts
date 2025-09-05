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

export interface AppState {
  currentTicker: string;
  currentIndex: number;
  tickers: Ticker[];
  favorites: string[];
  showFavoritesOnly: boolean;
  notes: Record<string, Note[]>;
}

export interface KeyboardShortcuts {
  'ArrowUp': () => void;
  'ArrowDown': () => void;
  'Shift+ArrowUp': () => void;
  'Shift+ArrowDown': () => void;
  'PageUp': () => void;
  'PageDown': () => void;
  'Space': () => void;
  'Enter': () => void;
  'Tab': () => void;
  'Escape': () => void;
}