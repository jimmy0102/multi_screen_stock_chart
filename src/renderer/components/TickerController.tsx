import React from 'react';

interface TickerControllerProps {
  currentTicker: string;
  currentTickerName: string;
  currentIndex: number;
  totalTickers: number;
  isFavorite: boolean;
  showFavoritesOnly: boolean;
  onToggleFavorite: () => void;
  onToggleFavoritesFilter: () => void;
  onOpenNotes: () => void;
  onSearchTicker?: (query: string) => void;
}

const TickerController: React.FC<TickerControllerProps> = ({
  currentTicker,
  currentTickerName,
  currentIndex,
  totalTickers,
  isFavorite,
  showFavoritesOnly,
  onToggleFavorite,
  onToggleFavoritesFilter,
  onOpenNotes,
  onSearchTicker
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearchTicker) {
      onSearchTicker(searchQuery.trim());
    }
  };
  return (
    <div className="ticker-controller">
      <div className="ticker-info">
        <div className="ticker-symbol">{currentTicker}</div>
        <div className="ticker-name">{currentTickerName}</div>
        <div className="ticker-index">
          {currentIndex + 1} / {totalTickers}
          {showFavoritesOnly && ' (お気に入りのみ)'}
        </div>
        
        {onSearchTicker && (
          <form className="ticker-search" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="証券コードまたは銘柄名で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-button">検索</button>
          </form>
        )}
      </div>
      
      <div className="ticker-controls">
        <button
          className={`control-button ${isFavorite ? 'favorite' : ''}`}
          onClick={onToggleFavorite}
          title="お気に入りに追加/削除 (Enter)"
        >
          {isFavorite ? '★' : '☆'}
        </button>
        
        <button
          className={`control-button ${showFavoritesOnly ? 'active' : ''}`}
          onClick={onToggleFavoritesFilter}
          title="お気に入りフィルター"
        >
          フィルター
        </button>
        
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