import React, { useMemo, useEffect, useRef } from 'react';
import { Ticker, WatchlistLevel } from '../types';

interface TickerListProps {
  tickers: Ticker[];
  currentTicker: string;
  watchlistLevels: Record<string, WatchlistLevel>;
  onTickerSelect: (ticker: string) => void;
}

const TickerList: React.FC<TickerListProps> = ({
  tickers,
  currentTicker,
  watchlistLevels,
  onTickerSelect
}) => {
  const activeItemRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ソートされた銘柄リスト（検索は上部のTickerControllerで行う）
  const sortedTickers = useMemo(() => {
    return [...tickers].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [tickers]);

  // 現在の銘柄が変更されたときに自動スクロール
  useEffect(() => {
    if (activeItemRef.current && scrollContainerRef.current) {
      const activeElement = activeItemRef.current;
      const container = scrollContainerRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      
      // アクティブな要素が表示領域外にある場合はスクロール
      if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [currentTicker]);

  // ウォッチリストレベルアイコンを取得
  const getWatchlistIcon = (level: WatchlistLevel) => {
    switch (level) {
      case 1: return { icon: 'fa-award', color: '#CD7F32' }; // 銅
      case 2: return { icon: 'fa-medal', color: '#C0C0C0' }; // 銀  
      case 3: return { icon: 'fa-crown', color: '#FFD700' }; // 金
      default: return null;
    }
  };

  return (
    <div className="ticker-list">
      <div className="ticker-list-content">
        <div className="ticker-list-count">
          {sortedTickers.length} 件の銘柄
        </div>
        
        <div className="ticker-list-items" ref={scrollContainerRef}>
          {sortedTickers.map((ticker) => {
            const level = watchlistLevels[ticker.symbol] || 0;
            const iconInfo = getWatchlistIcon(level);
            const isActive = ticker.symbol === currentTicker;
            
            return (
              <div
                key={ticker.symbol}
                ref={isActive ? activeItemRef : null}
                className={`ticker-list-item ${isActive ? 'active' : ''}`}
                onClick={() => onTickerSelect(ticker.symbol)}
              >
                <div className="ticker-symbol">{ticker.symbol}</div>
                <div className="ticker-name-container">
                  <div className="ticker-name">{ticker.name}</div>
                  {iconInfo && (
                    <i 
                      className={`fas ${iconInfo.icon} ticker-watchlist-icon`}
                      style={{ color: iconInfo.color }}
                    ></i>
                  )}
                </div>
                <div className="ticker-market">{ticker.market}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TickerList;