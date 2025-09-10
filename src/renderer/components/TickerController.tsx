import React, { useState, useRef, useEffect } from 'react';
import { WatchlistLevel, FilterState } from '../types';

interface TickerControllerProps {
  currentTicker: string;
  currentTickerName: string;
  currentIndex: number;
  totalTickers: number;
  currentWatchlistLevel: WatchlistLevel;
  currentFilter: FilterState;
  // 新しいコールバック
  onSetWatchlistLevel: (level: WatchlistLevel) => void;
  onSetFilter: (filter: FilterState) => void;
  // 後方互換性のため残す
  isFavorite: boolean;
  showFavoritesOnly: boolean;
  onToggleFavorite: () => void;
  onToggleFavoritesFilter: () => void;
  onOpenNotes: () => void;
  onSearchTicker?: (query: string) => void;
  // ウォッチリストカウント用
  watchlistCounts?: { bronze: number; silver: number; gold: number; };
}

const TickerController: React.FC<TickerControllerProps> = ({
  currentTicker,
  currentTickerName,
  currentIndex,
  totalTickers,
  currentWatchlistLevel,
  currentFilter,
  onSetWatchlistLevel,
  onSetFilter,
  isFavorite: _isFavorite,
  showFavoritesOnly: _showFavoritesOnly,
  onToggleFavorite: _onToggleFavorite,
  onToggleFavoritesFilter: _onToggleFavoritesFilter,
  onOpenNotes,
  onSearchTicker,
  watchlistCounts = { bronze: 0, silver: 0, gold: 0 }
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  
  const watchlistDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // ウォッチリストレベル設定
  const watchlistLevels = [
    { level: 0 as WatchlistLevel, icon: 'fa-circle', color: '#999', name: '', bgColor: '#fff' },
    { level: 1 as WatchlistLevel, icon: 'fa-award', color: '#CD7F32', name: '', bgColor: '#CD7F32' },
    { level: 2 as WatchlistLevel, icon: 'fa-medal', color: '#C0C0C0', name: '', bgColor: '#C0C0C0' },
    { level: 3 as WatchlistLevel, icon: 'fa-crown', color: '#FFD700', name: '', bgColor: '#FFD700' }
  ];

  // フィルター設定
  const filters = [
    { filter: 'all' as FilterState, name: '', icon: 'fa-list', color: '#666' },
    { filter: 'bronze' as FilterState, name: '', icon: 'fa-award', color: '#CD7F32' },
    { filter: 'silver' as FilterState, name: '', icon: 'fa-medal', color: '#C0C0C0' },
    { filter: 'gold' as FilterState, name: '', icon: 'fa-crown', color: '#FFD700' }
  ];

  // 現在の設定を取得
  const activeWatchlist = watchlistLevels.find(w => w.level === currentWatchlistLevel) || watchlistLevels[0];
  const activeFilter = filters.find(f => f.filter === currentFilter) || filters[0];

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(event.target as Node)) {
        setShowWatchlistDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearchTicker) {
      onSearchTicker(searchQuery.trim());
    }
  };

  const handleWatchlistSelect = (level: WatchlistLevel) => {
    onSetWatchlistLevel(level);
    setShowWatchlistDropdown(false);
  };

  const handleFilterSelect = (filter: FilterState) => {
    onSetFilter(filter);
    setShowFilterDropdown(false);
  };

  return (
    <div className="ticker-controller">
      <div className="ticker-info">
        <div className="ticker-symbol">{currentTicker}</div>
        <div className="ticker-name">{currentTickerName}</div>
        <div className="ticker-index">
          {totalTickers > 0 ? `${currentIndex + 1} / ${totalTickers}` : ''}
          {currentFilter !== 'all' && (
            <span style={{ marginLeft: '8px' }}>
              <i className={`fas ${activeFilter.icon}`} style={{ color: activeFilter.color }}></i>
            </span>
          )}
        </div>
      </div>
      
      <div className="ticker-controls">
        {/* 検索ボックス（左側に配置） */}
        {onSearchTicker && (
          <form className="ticker-search-inline" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="銘柄検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-inline"
            />
            <button type="submit" className="search-button-inline">
              <i className="fas fa-search"></i>
            </button>
          </form>
        )}
        
        {/* ウォッチリストボタン（アイコンのみ） */}
        <div className="control-dropdown" ref={watchlistDropdownRef}>
          <button
            className={`control-button icon-button watchlist-button ${currentWatchlistLevel > 0 ? 'active' : ''}`}
            onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
            title={currentWatchlistLevel === 0 ? '登録なし' : currentWatchlistLevel === 1 ? '銅' : currentWatchlistLevel === 2 ? '銀' : '金'}
            style={{
              backgroundColor: activeWatchlist.bgColor,
              borderColor: activeWatchlist.bgColor !== '#fff' ? activeWatchlist.bgColor : '#dee2e6'
            }}
          >
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <i className={`${currentWatchlistLevel === 0 ? 'far' : 'fas'} ${activeWatchlist.icon}`} 
                 style={{ color: currentWatchlistLevel === 0 ? '#999' : '#fff', fontSize: '18px' }}></i>
              {currentWatchlistLevel > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-12px',
                  background: '#fff',
                  color: activeWatchlist.color,
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '1px 4px',
                  borderRadius: '8px',
                  border: `1px solid ${activeWatchlist.color}`,
                  minWidth: '14px',
                  textAlign: 'center'
                }}>
                  {currentWatchlistLevel === 1 ? watchlistCounts.bronze :
                   currentWatchlistLevel === 2 ? watchlistCounts.silver :
                   watchlistCounts.gold}
                </span>
              )}
            </div>
          </button>
          
          {showWatchlistDropdown && (
            <div className="dropdown-menu">
              {watchlistLevels.map((item) => (
                <button
                  key={item.level}
                  className={`dropdown-item ${currentWatchlistLevel === item.level ? 'active' : ''}`}
                  onClick={() => handleWatchlistSelect(item.level)}
                  style={{ padding: '8px 12px', minWidth: 'auto' }}
                >
                  <i className={`${item.level === 0 ? 'far' : 'fas'} ${item.icon}`} 
                     style={{ color: item.color, fontSize: '16px' }}></i>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* フィルターボタン（現在の表示状態を示す） */}
        <div className="control-dropdown" ref={filterDropdownRef}>
          <button
            className={`control-button filter-button`}
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            title={`フィルター: ${currentFilter === 'all' ? 'すべて' : currentFilter === 'bronze' ? '銅のみ' : currentFilter === 'silver' ? '銀のみ' : '金のみ'}`}
            style={{
              backgroundColor: '#fff',
              borderColor: '#dee2e6',
              minWidth: '100px'
            }}
          >
            {currentFilter === 'all' ? (
              <span>すべて</span>
            ) : (
              <>
                <i className={`fas ${activeFilter.icon}`} 
                   style={{ color: activeFilter.color, fontSize: '16px', marginRight: '4px' }}></i>
                <span>のみ</span>
              </>
            )}
          </button>
          
          {showFilterDropdown && (
            <div className="dropdown-menu">
              {filters.map((item) => (
                <button
                  key={item.filter}
                  className={`dropdown-item ${currentFilter === item.filter ? 'active' : ''}`}
                  onClick={() => handleFilterSelect(item.filter)}
                  style={{ padding: '8px 12px', minWidth: 'auto' }}
                >
                  <i className={`fas ${item.icon}`} 
                     style={{ color: item.color, marginRight: '6px', fontSize: '14px' }}></i>
                  <span style={{ fontSize: '12px' }}>
                    {item.filter === 'all' ? 'すべて' : 'のみ'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* メモボタン */}
        <button
          className="control-button"
          onClick={onOpenNotes}
          title="メモを開く (Tab)"
        >
          📝 メモ
        </button>
      </div>
    </div>
  );
};

export default TickerController;