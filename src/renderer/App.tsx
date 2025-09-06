import React, { useState, useEffect, useCallback } from 'react';
import { TimeFrame, AppState } from './types';
import ChartPane from './components/ChartPane';
import TickerController from './components/TickerController';
import NoteDrawer from './components/NoteDrawer';
import LoginScreen from './components/LoginScreen';
import PWAInstaller from './components/PWAInstaller';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { simpleAuthService } from '../lib/auth-simple';
import { database } from '../lib/database';
import { getFavoritesSimple } from '../lib/direct-database';
import './App.css';

// 新しいチャートレイアウト設定
const chartLayouts = [
  { position: 'top-left', timeFrame: '1D' as TimeFrame, title: '日足' },
  { position: 'top-right', timeFrame: null, title: '' }, // 右上は空
  { position: 'bottom-left', timeFrame: '1W' as TimeFrame, title: '週足' },
  { position: 'bottom-right', timeFrame: '1M' as TimeFrame, title: '月足' }
];

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
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [authState, setAuthState] = useState({
    user: null as any,
    loading: true,
    error: null as string | null
  });

  // 認証状態の管理
  useEffect(() => {
    console.log('🔄 App: Initializing auth...');
    
    // 初期化を実行
    simpleAuthService.initialize().then(() => {
      console.log('🔐 Auth initialized');
    });
    
    const unsubscribe = simpleAuthService.subscribe((state) => {
      console.log('🔐 Auth state received:', { 
        hasUser: !!state.user, 
        loading: state.loading,
        error: state.error 
      });
      setAuthState(state);
    });

    return () => unsubscribe();
  }, []);

  // 共通の初期化処理
  const loadAppData = useCallback(async (isRetry = false) => {
    try {
      console.log(`[App] ${isRetry ? 'Retrying' : 'Initializing'} app...`);
      setLoadingError(null);
      
      // データベースから直接全銘柄を取得
      console.log('[App] Fetching tickers from database...');
      const tickers = await database.getAllTickers();
      console.log('[App] Received tickers:', tickers.length);
      
      if (isRetry && tickers.length === 0) {
        throw new Error('データベースから銘柄データを取得できませんでした');
      }
      
      // ローカルストレージからお気に入りを読み込み
      let savedFavorites: string[] = [];
      try {
        const stored = localStorage.getItem('favorites');
        if (stored) {
          savedFavorites = JSON.parse(stored);
          console.log('[App] Loaded favorites from localStorage:', savedFavorites);
        }
      } catch (error) {
        console.error('[App] Failed to load favorites from localStorage:', error);
      }
      
      // Supabaseからも試行（タイムアウトしても問題なし）
      const favorites = await getFavoritesSimple(authState.user?.id);
      console.log('[App] Received favorites from Supabase:', favorites.length);
      
      // ローカルとSupabaseのお気に入りをマージ
      const allFavorites = [...new Set([...savedFavorites, ...favorites.map(f => f.ticker)])];
      
      if (tickers.length > 0) {
        console.log('[App] Setting app state with tickers...');
        setAppState(prev => ({
          ...prev,
          tickers,
          favorites: allFavorites,
          currentTicker: tickers[0].symbol
        }));
        console.log('[App] App state updated with', tickers.length, 'tickers');
      } else if (!isRetry) {
        console.warn('[App] No tickers received from database');
      }
    } catch (error) {
      console.error(`[App] ${isRetry ? 'Retry' : 'Initialization'} failed:`, error);
      setLoadingError(error instanceof Error ? error.message : 'アプリの初期化に失敗しました');
    } finally {
      console.log('[App] Setting loading to false');
      setIsLoading(false);
    }
  }, [authState.user]);

  // 初期データ読み込み（認証後）
  useEffect(() => {
    if (!authState.user || authState.loading) return;
    loadAppData();
  }, [authState.user, authState.loading, loadAppData]);

  // リトライ関数
  const handleRetry = () => {
    console.log('[App] Manual retry requested');
    setIsLoading(true);
    setLoadingError(null);
    loadAppData(true);
  };

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
  const toggleFavorite = () => {
    const isFav = appState.favorites.includes(appState.currentTicker);
    
    console.log('[App] Toggling favorite for:', appState.currentTicker, 'Current state:', isFav);
    
    if (isFav) {
      // お気に入りから削除
      setAppState(prev => ({
        ...prev,
        favorites: prev.favorites.filter(f => f !== prev.currentTicker)
      }));
      console.log('[App] Removed from favorites:', appState.currentTicker);
    } else {
      // お気に入りに追加
      setAppState(prev => ({
        ...prev,
        favorites: [...prev.favorites, prev.currentTicker]
      }));
      console.log('[App] Added to favorites:', appState.currentTicker);
    }
    
    // ローカルストレージに保存（永続化）
    try {
      const updatedFavorites = isFav 
        ? appState.favorites.filter(f => f !== appState.currentTicker)
        : [...appState.favorites, appState.currentTicker];
      localStorage.setItem('favorites', JSON.stringify(updatedFavorites));
    } catch (error) {
      console.error('[App] Failed to save favorites to localStorage:', error);
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

    // 証券コードまたは銘柄名で検索（4桁コードのみなので変換不要）
    const foundIndex = displayTickers.findIndex(ticker => 
      ticker.symbol === query ||
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

  // 認証チェック
  if (authState.loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>認証状態を確認中...</p>
          {authState.error && (
            <p style={{color: 'red', marginTop: '10px'}}>
              {authState.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!authState.user) {
    return <LoginScreen />;
  }

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

  if (loadingError) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="error-icon">⚠️</div>
          <h3>データの読み込みに失敗しました</h3>
          <p className="error-message">{loadingError}</p>
          <button 
            className="retry-button" 
            onClick={handleRetry}
            disabled={isLoading}
          >
            {isLoading ? '読み込み中...' : '再読み込み'}
          </button>
          <p className="error-help">
            問題が解決しない場合は、ページを再読み込みしてください。
          </p>
        </div>
      </div>
    );
  }

  if (appState.tickers.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="error-icon">📊</div>
          <h3>銘柄データがありません</h3>
          <p>データベースから銘柄情報を取得できませんでした。</p>
          <button 
            className="retry-button" 
            onClick={handleRetry}
            disabled={isLoading}
          >
            {isLoading ? '読み込み中...' : '再読み込み'}
          </button>
        </div>
      </div>
    );
  }

  const currentTickerData = appState.tickers.find(t => t.symbol === appState.currentTicker);
  const isFavorite = appState.favorites.includes(appState.currentTicker);

  return (
    <div className="app">
      <PWAInstaller />
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
        {chartLayouts.map((layout) => (
          layout.timeFrame ? (
            <ChartPane
              key={layout.position}
              ticker={appState.currentTicker}
              timeFrame={layout.timeFrame}
              title={layout.title}
              delay={0} // 並列読み込み
            />
          ) : (
            <div key={layout.position} className="chart-pane empty-pane">
              <div className="empty-pane-content">
                {/* 右上は空のペイン */}
              </div>
            </div>
          )
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