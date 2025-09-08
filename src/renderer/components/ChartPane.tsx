import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, IPriceLine } from 'lightweight-charts';
import { TimeFrame, ChartOptions } from '../types';
import { getChartColors } from '../config/chartColors';
import { database } from '../../lib/database';

interface ChartPaneProps {
  ticker: string;
  timeFrame: TimeFrame;
  title: string;
  delay?: number; // 遅延読み込みのミリ秒
  onCrosshairMove?: (price: number | null, time: any, sourceChart: string) => void;
  syncedPrice?: number | null;
  syncedTime?: any;
  sourceChart?: string; // 同期の送信者を識別
  horizontalLineMode?: boolean;
  onHorizontalLineAdded?: () => void;
  horizontalLineUpdate?: number; // 更新トリガー
}

interface HorizontalLine {
  id: string;
  price: number;
  color: string;
  priceLine?: IPriceLine;
}

const ChartPane: React.FC<ChartPaneProps> = ({ 
  ticker, 
  timeFrame, 
  title, 
  delay = 0, 
  onCrosshairMove,
  syncedPrice,
  syncedTime,
  sourceChart,
  horizontalLineMode = false,
  onHorizontalLineAdded,
  horizontalLineUpdate = 0
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizontalLines, setHorizontalLines] = useState<HorizontalLine[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingLinePrice, setPendingLinePrice] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lineId?: string } | null>(null);
  
  // 水平線設定の取得
  const lineWidth = parseInt((import.meta as any).env.VITE_HORIZONTAL_LINE_WIDTH || '3');
  const lineOpacity = parseFloat((import.meta as any).env.VITE_HORIZONTAL_LINE_OPACITY || '0.8');
  const lineStyle = (import.meta as any).env.VITE_HORIZONTAL_LINE_STYLE || 'solid';
  
  // プリセットカラー
  const HORIZONTAL_LINE_COLORS = [
    { name: 'レジスタンス（強）', color: '#FF0000' },
    { name: 'レジスタンス（弱）', color: '#FF9999' },
    { name: 'サポート（強）', color: '#0000FF' },
    { name: 'サポート（弱）', color: '#9999FF' },
    { name: '中立ライン', color: '#FFD700' },
    { name: '注目ライン', color: '#00FF00' },
    { name: 'カスタム', color: '#808080' }
  ];

  // チャートの初期化
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartOptions: ChartOptions = {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: {
          color: '#ffffff'
        },
        textColor: '#333333'
      },
      grid: {
        vertLines: {
          color: '#e0e0e0'
        },
        horzLines: {
          color: '#e0e0e0'
        }
      },
      crosshair: {
        mode: 0 // CrosshairMode.Normal (0=Normal, 1=Magnet) - カーソル位置に自由に追従
      },
      rightPriceScale: {
        borderColor: '#e0e0e0'
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: true,
        secondsVisible: false
      }
    };

    // チャート色設定を取得
    const colors = getChartColors();
    console.log('Chart colors loaded:', colors);

    const chart = createChart(chartContainerRef.current, chartOptions);
    const series = chart.addCandlestickSeries({
      upColor: colors.bullish.body,
      downColor: colors.bearish.body,
      borderDownColor: colors.bearish.border,
      borderUpColor: colors.bullish.border,
      wickDownColor: colors.bearish.wick,
      wickUpColor: colors.bullish.wick
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // リサイズハンドラー
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    // クロスヘアムーブイベントリスナーを追加
    const handleCrosshairMove = (param: any) => {
      if (param.point && seriesRef.current) {
        // カーソルのY座標から正確な価格を取得
        const price = seriesRef.current.coordinateToPrice(param.point.y);
        
        // 親コンポーネントに通知（チャート間同期用）
        if (onCrosshairMove && price !== null && price !== undefined) {
          onCrosshairMove(price, param.time, title);
        }
      } else {
        // カーソルがチャート外の場合
        if (onCrosshairMove) {
          onCrosshairMove(null, null, title);
        }
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // データの読み込みと更新
  useEffect(() => {
    if (!ticker || !seriesRef.current) return;

    const loadStockData = async () => {
      setIsLoading(true);
      setError(null);

      // 遅延読み込み（API制限対策）
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        // より多くのデータを表示するために制限を緩和
        const limit = timeFrame === '1D' ? 1000 : timeFrame === '1W' ? 500 : 100;
        
        // Supabaseから実際のデータを取得
        console.log('[ChartPane] Fetching real data from Supabase for:', ticker, timeFrame);
        
        // database からデータを取得
        const { database } = await import('../../lib/database');
        const stockData = await database.getStockData(ticker, timeFrame, limit);
        
        // データが取得できない場合はエラー表示
        if (stockData.length === 0) {
          console.warn('[ChartPane] No real data available for', ticker, timeFrame);
        }
        
        if (stockData.length === 0) {
          setError(`${timeFrame} データがありません`);
          seriesRef.current?.setData([]);
          return;
        }

        // データをlightweight-charts形式に変換
        const chartData: CandlestickData[] = stockData
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((data: any) => ({
            time: Math.floor(new Date(data.date).getTime() / 1000) as any,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close
          }))
          .filter((data, index, array) => 
            index === 0 || data.time !== array[index - 1].time
          );

        console.log(`Setting ${chartData.length} data points for ${ticker} ${timeFrame}`);
        seriesRef.current?.setData(chartData);
        
        // 統一された表示範囲を設定（直近100本のロウソク足を表示）
        if (chartRef.current && chartData.length > 0) {
          const visibleBars = 100;
          const lastIndex = chartData.length - 1;
          
          if (chartData.length > visibleBars) {
            const firstVisibleIndex = Math.max(0, lastIndex - visibleBars + 1);
            chartRef.current.timeScale().setVisibleRange({
              from: chartData[firstVisibleIndex].time as any,
              to: chartData[lastIndex].time as any
            });
            
            // 右側に少し余白を追加
            setTimeout(() => {
              if (chartRef.current) {
                const paddedFirstIndex = Math.max(0, lastIndex - visibleBars - 5);
                const paddedTo = chartData[Math.min(lastIndex, lastIndex + 5)]?.time || chartData[lastIndex].time;
                
                chartRef.current.timeScale().setVisibleRange({
                  from: chartData[paddedFirstIndex].time as any,
                  to: paddedTo as any
                });
              }
            }, 100);
          } else {
            chartRef.current.timeScale().fitContent();
          }
        }
      } catch (err) {
        console.error('Failed to load stock data:', err);
        setError('データの読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    loadStockData();
  }, [ticker, timeFrame, delay]);

  // 他のチャートからの同期プライスを受け取った時の処理
  useEffect(() => {
    // 自分自身のチャートからの同期は無視
    if (sourceChart === title) {
      return;
    }

    if (syncedPrice !== null && syncedTime !== null && chartRef.current && seriesRef.current) {
      try {
        // 価格が有効な数値であることを確認
        if (typeof syncedPrice === 'number' && !isNaN(syncedPrice)) {
          chartRef.current.setCrosshairPosition(syncedPrice, syncedTime, seriesRef.current);
          console.log(`Synced crosshair to price ${syncedPrice} on ${title} chart (from ${sourceChart})`);
        }
      } catch (error) {
        console.warn(`Failed to sync crosshair on ${title} chart:`, error);
      }
    } else if (syncedPrice === null && chartRef.current) {
      // 他のチャートでカーソルが外れた場合、このチャートのクロスヘアもクリア
      try {
        chartRef.current.clearCrosshairPosition();
        console.log(`Cleared crosshair on ${title} chart`);
      } catch (error) {
        console.warn(`Failed to clear crosshair on ${title} chart:`, error);
      }
    }
  }, [syncedPrice, syncedTime, sourceChart, title]);

  // 水平線の初期化フラグ
  const horizontalLinesLoadedRef = useRef<string>('');

  // 水平線を読み込む
  useEffect(() => {
    const loadHorizontalLines = async () => {
      const currentKey = `${ticker}-${timeFrame}`;
      
      // 既存の水平線をクリーンアップ
      if (horizontalLinesLoadedRef.current !== currentKey) {
        // 銘柄またはtimeframeが変わった場合のみクリーンアップ
        setHorizontalLines(prevLines => {
          prevLines.forEach(line => {
            if (line.priceLine && seriesRef.current) {
              try {
                seriesRef.current.removePriceLine(line.priceLine);
              } catch (e) {
                // 既に削除されている場合のエラーを無視
              }
            }
          });
          return [];
        });
      }
      
      const drawings = await database.getChartDrawings(ticker, timeFrame);
      const newLines: HorizontalLine[] = [];
      
      // 既存の水平線を全て削除してから新規追加（重複防止）
      horizontalLines.forEach(line => {
        if (line.priceLine && seriesRef.current) {
          try {
            seriesRef.current.removePriceLine(line.priceLine);
          } catch (e) {
            // エラーを無視
          }
        }
      });
      
      // チャートに水平線を追加
      drawings.forEach(d => {
        if (seriesRef.current) {
          try {
            const priceLine = seriesRef.current.createPriceLine({
              price: d.data.price,
              color: d.data.color,
              lineWidth: lineWidth as any,
              lineStyle: lineStyle === 'dashed' ? 2 : lineStyle === 'dotted' ? 3 : 0,
              axisLabelVisible: true,
              title: ''
            });
            
            newLines.push({
              id: d.id,
              price: d.data.price,
              color: d.data.color,
              priceLine
            });
          } catch (e) {
            console.warn('Failed to create price line:', e);
          }
        }
      });
      
      setHorizontalLines(newLines);
      horizontalLinesLoadedRef.current = currentKey;
    };

    if (ticker && seriesRef.current) {
      // 少し遅延を入れてチャートの準備を待つ
      setTimeout(() => {
        loadHorizontalLines();
      }, 100);
    }
  }, [ticker, timeFrame, lineWidth, lineStyle, horizontalLineUpdate]);

  // チャートクリック時の処理
  const handleChartClick = useCallback((param: any) => {
    if (horizontalLineMode && param.point) {
      const price = seriesRef.current?.coordinateToPrice(param.point.y);
      if (price !== null && price !== undefined) {
        setPendingLinePrice(price);
        setShowColorPicker(true);
      }
    }
  }, [horizontalLineMode]);

  // 色選択後の処理
  const handleColorSelect = useCallback(async (color: string) => {
    if (pendingLinePrice !== null && seriesRef.current) {
      // データベースに保存
      const drawing = await database.saveChartDrawing(
        ticker,
        timeFrame,
        'horizontal_line',
        { price: pendingLinePrice, color, width: lineWidth }
      );
      
      if (drawing) {
        // チャートに表示
        const priceLine = seriesRef.current.createPriceLine({
          price: pendingLinePrice,
          color: color,
          lineWidth: lineWidth as any,
          lineStyle: lineStyle === 'dashed' ? 2 : lineStyle === 'dotted' ? 3 : 0,
          axisLabelVisible: true,
          title: ''
        });
        
        setHorizontalLines(prev => [...prev, {
          id: drawing.id,
          price: pendingLinePrice,
          color: color,
          priceLine
        }]);
      }
    }
    
    setShowColorPicker(false);
    setPendingLinePrice(null);
    onHorizontalLineAdded?.();
  }, [pendingLinePrice, ticker, timeFrame, lineWidth, lineStyle, onHorizontalLineAdded]);

  // 水平線削除処理
  const handleDeleteLine = useCallback(async (lineId: string) => {
    const success = await database.deleteChartDrawing(lineId);
    if (success) {
      setHorizontalLines(prev => {
        const line = prev.find(l => l.id === lineId);
        if (line?.priceLine) {
          seriesRef.current?.removePriceLine(line.priceLine);
        }
        return prev.filter(l => l.id !== lineId);
      });
      
      // 他のチャートも更新（削除の同期）
      onHorizontalLineAdded?.();
    }
    setContextMenu(null);
  }, [onHorizontalLineAdded]);

  // チャート上でクリックイベントを設定
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.subscribeClick(handleChartClick);
      return () => {
        chartRef.current?.unsubscribeClick(handleChartClick);
      };
    }
  }, [handleChartClick]);

  // 右クリックメニュー処理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // 水平線上かチェック
    const clickY = e.nativeEvent.offsetY;
    const clickedLine = horizontalLines.find(line => {
      if (seriesRef.current && line.priceLine) {
        const lineY = seriesRef.current.priceToCoordinate(line.price);
        return lineY && Math.abs(lineY - clickY) < 5;
      }
      return false;
    });
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      lineId: clickedLine?.id
    });
  }, [horizontalLines]);

  return (
    <div className="chart-pane">
      <div className="chart-header">
        <div className="chart-title">
          {title} - {ticker}
          {horizontalLineMode && <span style={{ marginLeft: '10px', color: '#ff0000' }}>📏 水平線モード</span>}
        </div>
      </div>
      
      <div className="chart-container">
        {isLoading && (
          <div className="chart-loading">
            データを読み込み中...
          </div>
        )}
        
        {error && (
          <div className="chart-error">
            {error}
          </div>
        )}
        
        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: '100%',
            visibility: isLoading || error ? 'hidden' : 'visible',
            cursor: horizontalLineMode ? 'crosshair' : 'default'
          }}
          onContextMenu={handleContextMenu}
        />
        
        {/* 色選択パレット */}
        {showColorPicker && (
          <div className="color-picker-overlay" onClick={() => setShowColorPicker(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
            <div className="color-picker-popup" onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
              }}>
              <h3>水平線の色を選択</h3>
              <div className="color-options" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {HORIZONTAL_LINE_COLORS.map(({ name, color }) => (
                  <div
                    key={color}
                    className="color-option"
                    onClick={() => handleColorSelect(color)}
                    style={{
                      backgroundColor: color,
                      width: '40px',
                      height: '40px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: '2px solid #ccc',
                      opacity: lineOpacity
                    }}
                    title={name}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* 右クリックメニュー */}
        {contextMenu && (
          <div 
            className="context-menu"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              zIndex: 1000
            }}
            onMouseLeave={() => setContextMenu(null)}
          >
            {contextMenu.lineId ? (
              <button
                onClick={() => handleDeleteLine(contextMenu.lineId!)}
                style={{
                  display: 'block',
                  padding: '8px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left'
                }}
              >
                この水平線を削除
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartPane;