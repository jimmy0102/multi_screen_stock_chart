import React, { useState, useEffect } from 'react';
import { TimeFrame, AppState } from './types';
import ChartPane from './components/ChartPane';
import TickerController from './components/TickerController';
import NoteDrawer from './components/NoteDrawer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

const timeFrames: TimeFrame[] = ['60m', '1D', '1W', '1M'];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    currentTicker: '',
    currentIndex: 0,
    tickers: [],
    favorites: [],
    showFavoritesOnly: false,
    notes: {}
  });

  const [isNoteDrawerOpen, setIsNoteDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 初期データ読み込み
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing app...');
        const tickers = await window.electronAPI.getAllTickers();
        console.log('Received tickers:', tickers.length);
        const favorites = await window.electronAPI.getFavorites();
        console.log('Received favorites:', favorites.length);
        
        if (tickers.length > 0) {
          setAppState(prev => ({
            ...prev,
            tickers,
            favorites: favorites.map(f => f.ticker),
            currentTicker: tickers[0].symbol
          }));
          console.log('App state updated with', tickers.length, 'tickers');
        } else {
          console.warn('No tickers received from database');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  // 銘柄切り替え関数
  const navigateToTicker = (direction: 'prev' | 'next', step: number = 1) => {
    const availableTickers = appState.showFavoritesOnly 
      ? appState.tickers.filter(t => appState.favorites.includes(t.symbol))
      : appState.tickers;

    if (availableTickers.length === 0) return;

    let newIndex = appState.currentIndex;
    
    if (direction === 'next') {
      newIndex = (newIndex + step) % availableTickers.length;
    } else {
      newIndex = (newIndex - step + availableTickers.length) % availableTickers.length;
    }

    const newTicker = availableTickers[newIndex];
    setAppState(prev => ({
      ...prev,
      currentIndex: newIndex,
      currentTicker: newTicker.symbol
    }));
  };

  // お気に入りトグル
  const toggleFavorite = async () => {
    const isFav = appState.favorites.includes(appState.currentTicker);
    
    try {
      if (isFav) {
        await window.electronAPI.removeFromFavorites(appState.currentTicker);
        setAppState(prev => ({
          ...prev,
          favorites: prev.favorites.filter(f => f !== prev.currentTicker)
        }));
      } else {
        await window.electronAPI.addToFavorites(appState.currentTicker);
        setAppState(prev => ({
          ...prev,
          favorites: [...prev.favorites, prev.currentTicker]
        }));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  // お気に入りフィルターモードトグル
  const toggleFavoritesFilter = () => {
    setAppState(prev => ({
      ...prev,
      showFavoritesOnly: !prev.showFavoritesOnly,
      currentIndex: 0
    }));
  };

  // 銘柄検索機能
  const searchTicker = (query: string) => {
    const displayTickers = appState.showFavoritesOnly 
      ? appState.tickers.filter(t => appState.favorites.includes(t.symbol))
      : appState.tickers;

    // 証券コードまたは銘柄名で検索
    const foundIndex = displayTickers.findIndex(ticker => 
      ticker.symbol.includes(query.toUpperCase()) || 
      ticker.name.includes(query)
    );

    if (foundIndex !== -1) {
      setAppState(prev => ({
        ...prev,
        currentIndex: foundIndex,
        currentTicker: displayTickers[foundIndex].symbol
      }));
    } else {
      alert(`「${query}」に該当する銘柄が見つかりませんでした`);
    }
  };

  // キーボードショートカット設定
  useKeyboardShortcuts({
    'ArrowUp': () => navigateToTicker('prev'),
    'ArrowDown': () => navigateToTicker('next'),
    'Shift+ArrowUp': () => navigateToTicker('prev', 10),
    'Shift+ArrowDown': () => navigateToTicker('next', 10),
    'PageUp': () => navigateToTicker('prev', 100),
    'PageDown': () => navigateToTicker('next', 100),
    'Space': () => toggleFavoritesFilter(),  // スペースキーでお気に入り表示切替
    'Enter': toggleFavorite,           // エンターキーでお気に入り切替
    'Tab': () => setIsNoteDrawerOpen(true),  // タブキーでメモ開く
    'Escape': () => setIsNoteDrawerOpen(false)
  });

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>株価データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (appState.tickers.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <p>銘柄データがありません</p>
          <p>データをインポートしてください</p>
        </div>
      </div>
    );
  }

  const currentTickerData = appState.tickers.find(t => t.symbol === appState.currentTicker);
  const isFavorite = appState.favorites.includes(appState.currentTicker);

  return (
    <div className="app">
      <TickerController
        currentTicker={appState.currentTicker}
        currentTickerName={currentTickerData?.name || ''}
        currentIndex={appState.currentIndex}
        totalTickers={appState.showFavoritesOnly 
          ? appState.tickers.filter(t => appState.favorites.includes(t.symbol)).length
          : appState.tickers.length
        }
        isFavorite={isFavorite}
        showFavoritesOnly={appState.showFavoritesOnly}
        onToggleFavorite={toggleFavorite}
        onToggleFavoritesFilter={toggleFavoritesFilter}
        onOpenNotes={() => setIsNoteDrawerOpen(true)}
        onSearchTicker={searchTicker}
      />

      <div className="chart-grid">
        {timeFrames.map((timeFrame) => (
          <ChartPane
            key={timeFrame}
            ticker={appState.currentTicker}
            timeFrame={timeFrame}
            title={`${timeFrame} Chart`}
            delay={0} // 並列読み込み
          />
        ))}
      </div>

      <NoteDrawer
        isOpen={isNoteDrawerOpen}
        ticker={appState.currentTicker}
        onClose={() => setIsNoteDrawerOpen(false)}
      />
    </div>
  );
};

export default App;