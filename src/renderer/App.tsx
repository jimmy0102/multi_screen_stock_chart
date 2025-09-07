import React, { useState, useEffect, useCallback } from 'react';
import { TimeFrame, AppState, WatchlistLevel, FilterState } from './types';
import ChartPane from './components/ChartPane';
import TickerController from './components/TickerController';
import NoteDrawer from './components/NoteDrawer';
import LoginScreen from './components/LoginScreen';
import PWAInstaller from './components/PWAInstaller';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { simpleAuthService } from '../lib/auth-simple';
import { database } from '../lib/database';
import { getFavoritesSimple } from '../lib/direct-database';
import '@fortawesome/fontawesome-free/css/all.min.css';
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
    favorites: [], // 後方互換性のため残す
    watchlistLevels: {}, // 新しいウォッチリストシステム
    currentFilter: 'all',
    showFavoritesOnly: false, // 後方互換性のため残す
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
      
      // ローカルストレージからお気に入りを読み込み（後方互換性）
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
      
      // ローカルストレージからウォッチリストレベルを読み込み
      let savedWatchlistLevels: Record<string, WatchlistLevel> = {};
      try {
        const stored = localStorage.getItem('watchlistLevels');
        if (stored) {
          savedWatchlistLevels = JSON.parse(stored);
          console.log('[App] Loaded watchlist levels from localStorage:', Object.keys(savedWatchlistLevels).length, 'items');
        }
      } catch (error) {
        console.error('[App] Failed to load watchlist levels from localStorage:', error);
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
          watchlistLevels: savedWatchlistLevels,
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

  // ウォッチリストレベル管理関数
  const setWatchlistLevel = useCallback((ticker: string, level: WatchlistLevel) => {
    setAppState(prev => {
      const newWatchlistLevels = { ...prev.watchlistLevels };
      if (level === 0) {
        delete newWatchlistLevels[ticker]; // レベル0は削除
      } else {
        newWatchlistLevels[ticker] = level;
      }
      
      // ローカルストレージに保存
      try {
        localStorage.setItem('watchlistLevels', JSON.stringify(newWatchlistLevels));
      } catch (error) {
        console.error('[App] Failed to save watchlist levels to localStorage:', error);
      }
      
      return {
        ...prev,
        watchlistLevels: newWatchlistLevels
      };
    });
  }, []);

  // 現在の銘柄のウォッチリストレベルを取得
  const getCurrentWatchlistLevel = useCallback((): WatchlistLevel => {
    return appState.watchlistLevels[appState.currentTicker] || 0;
  }, [appState.watchlistLevels, appState.currentTicker]);

  // ウォッチリストレベルを順次アップ（Enter機能）
  const cycleLevelUp = useCallback(() => {
    const currentLevel = getCurrentWatchlistLevel();
    const nextLevel = currentLevel === 3 ? 0 : (currentLevel + 1) as WatchlistLevel;
    setWatchlistLevel(appState.currentTicker, nextLevel);
    console.log(`[App] ${appState.currentTicker} level changed: ${currentLevel} → ${nextLevel}`);
  }, [appState.currentTicker, getCurrentWatchlistLevel, setWatchlistLevel]);

  // フィルター切り替え関数
  const switchFilter = useCallback((direction: 'next' | 'prev') => {
    const filters: FilterState[] = ['all', 'bronze', 'silver', 'gold'];
    const currentIndex = filters.indexOf(appState.currentFilter);
    
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % filters.length;
    } else {
      nextIndex = (currentIndex - 1 + filters.length) % filters.length;
    }
    
    const newFilter = filters[nextIndex];
    
    // 新しいフィルターでの利用可能な銘柄を取得
    let newFilteredTickers;
    switch (newFilter) {
      case 'bronze':
        newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 1);
        break;
      case 'silver':
        newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 2);
        break;
      case 'gold':
        newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 3);
        break;
      case 'all':
      default:
        newFilteredTickers = appState.tickers;
        break;
    }
    
    // 新しい現在の銘柄を設定
    let newCurrentTicker = appState.currentTicker;
    let newCurrentIndex = 0;
    
    if (newFilteredTickers.length > 0) {
      // フィルターされた銘柄がある場合、最初の銘柄を表示
      newCurrentTicker = newFilteredTickers[0].symbol;
      newCurrentIndex = 0;
    }
    
    setAppState(prev => ({
      ...prev,
      currentFilter: newFilter,
      currentTicker: newCurrentTicker,
      currentIndex: newCurrentIndex
    }));
    
    console.log(`[App] Filter changed: ${appState.currentFilter} → ${newFilter}, showing: ${newCurrentTicker}`);
  }, [appState.currentFilter, appState.tickers, appState.watchlistLevels, appState.currentTicker]);

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

  // フィルター済み銘柄リストを取得
  const getFilteredTickers = useCallback(() => {
    switch (appState.currentFilter) {
      case 'bronze':
        return appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 1);
      case 'silver':
        return appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 2);
      case 'gold':
        return appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 3);
      case 'all':
      default:
        return appState.tickers;
    }
  }, [appState.currentFilter, appState.tickers, appState.watchlistLevels]);

  // 銘柄切り替え関数
  const navigateToTicker = (direction: 'prev' | 'next', step: number = 1) => {
    const availableTickers = getFilteredTickers();

    if (availableTickers.length === 0) {
      console.warn(`[App] No tickers available for filter: ${appState.currentFilter}`);
      return;
    }

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
    // 銘柄ナビゲーション
    'ArrowUp': () => navigateToTicker('prev'),
    'ArrowDown': () => navigateToTicker('next'),
    'Shift+ArrowUp': () => navigateToTicker('prev', 10),
    'Shift+ArrowDown': () => navigateToTicker('next', 10),
    'PageUp': () => navigateToTicker('prev', 100),
    'PageDown': () => navigateToTicker('next', 100),
    
    // フィルター切り替え
    'ArrowLeft': () => switchFilter('prev'),
    'ArrowRight': () => switchFilter('next'),
    
    // ウォッチリストレベル設定
    '0': () => setWatchlistLevel(appState.currentTicker, 0),
    '1': () => setWatchlistLevel(appState.currentTicker, 1),
    '2': () => setWatchlistLevel(appState.currentTicker, 2),
    '3': () => setWatchlistLevel(appState.currentTicker, 3),
    'Enter': cycleLevelUp, // 順次レベルアップ
    
    // その他
    'Space': () => toggleFavoritesFilter(), // 従来機能との互換性
    'Tab': () => setIsNoteDrawerOpen(true),
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
  const currentWatchlistLevel = getCurrentWatchlistLevel();
  const filteredTickers = getFilteredTickers();
  
  // ウォッチリストカウントを計算
  const watchlistCounts = {
    bronze: appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 1).length,
    silver: appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 2).length,
    gold: appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 3).length,
  };

  // フィルターで登録銘柄がない場合の処理
  if (filteredTickers.length === 0 && appState.currentFilter !== 'all') {
    return (
      <div className="app">
        <PWAInstaller />
        <TickerController
          currentTicker=""
          currentTickerName=""
          currentIndex={0}
          totalTickers={0}
          currentWatchlistLevel={0}
          currentFilter={appState.currentFilter}
          // 新しいコールバック
          onSetWatchlistLevel={() => {}}
          onSetFilter={(filter) => setAppState(prev => ({ ...prev, currentFilter: filter, currentIndex: 0 }))}
          // 後方互換性のため残す
          isFavorite={false}
          showFavoritesOnly={appState.showFavoritesOnly}
          onToggleFavorite={() => {}}
          onToggleFavoritesFilter={toggleFavoritesFilter}
          onOpenNotes={() => setIsNoteDrawerOpen(true)}
          onSearchTicker={searchTicker}
          watchlistCounts={watchlistCounts}
        />
        
        <div className="loading-screen">
          <div className="loading-content">
            <div className="error-icon">📊</div>
            <h3>登録銘柄がありません</h3>
            <p className="error-message">
              {appState.currentFilter === 'gold' && '金ウォッチリストに登録された銘柄がありません'}
              {appState.currentFilter === 'silver' && '銀ウォッチリストに登録された銘柄がありません'}
              {appState.currentFilter === 'bronze' && '銅ウォッチリストに登録された銘柄がありません'}
            </p>
            <button 
              className="retry-button"
              onClick={() => setAppState(prev => ({ ...prev, currentFilter: 'all', currentIndex: 0 }))}
            >
              全銘柄を表示
            </button>
          </div>
        </div>
        
        <NoteDrawer
          isOpen={isNoteDrawerOpen}
          onClose={() => setIsNoteDrawerOpen(false)}
          ticker={appState.currentTicker}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <PWAInstaller />
      <TickerController
        currentTicker={appState.currentTicker}
        currentTickerName={currentTickerData?.name || ''}
        currentIndex={appState.currentIndex}
        totalTickers={filteredTickers.length}
        currentWatchlistLevel={currentWatchlistLevel}
        currentFilter={appState.currentFilter}
        // 新しいコールバック
        onSetWatchlistLevel={(level) => setWatchlistLevel(appState.currentTicker, level)}
        onSetFilter={(filter) => {
          // 新しいフィルターでの利用可能な銘柄を取得
          let newFilteredTickers;
          switch (filter) {
            case 'bronze':
              newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 1);
              break;
            case 'silver':
              newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 2);
              break;
            case 'gold':
              newFilteredTickers = appState.tickers.filter(t => appState.watchlistLevels[t.symbol] === 3);
              break;
            case 'all':
            default:
              newFilteredTickers = appState.tickers;
              break;
          }
          
          // 新しい現在の銘柄を設定
          let newCurrentTicker = appState.currentTicker;
          let newCurrentIndex = 0;
          
          if (newFilteredTickers.length > 0) {
            // フィルターされた銘柄がある場合、最初の銘柄を表示
            newCurrentTicker = newFilteredTickers[0].symbol;
            newCurrentIndex = 0;
          }
          
          setAppState(prev => ({ 
            ...prev, 
            currentFilter: filter, 
            currentTicker: newCurrentTicker,
            currentIndex: newCurrentIndex 
          }));
        }}
        // 後方互換性のため残す
        isFavorite={isFavorite}
        showFavoritesOnly={appState.showFavoritesOnly}
        onToggleFavorite={toggleFavorite}
        onToggleFavoritesFilter={toggleFavoritesFilter}
        onOpenNotes={() => setIsNoteDrawerOpen(true)}
        onSearchTicker={searchTicker}
        watchlistCounts={watchlistCounts}
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