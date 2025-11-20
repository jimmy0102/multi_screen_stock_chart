import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, IPriceLine } from 'lightweight-charts';
import { TimeFrame } from '../types';
import { getChartColors } from '../config/chartColors';
import { database } from '../../lib/database';
import type { HorizontalLineSettings } from '../../lib/types';

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
  lineSettings: HorizontalLineSettings;
  userId?: string;
  onToggleHorizontalMode: () => void;
}

interface HorizontalLine {
  id: string;
  price: number;
  color: string;
  width: number;
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
  horizontalLineUpdate = 0,
  lineSettings,
  userId,
  onToggleHorizontalMode
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizontalLines, setHorizontalLines] = useState<HorizontalLine[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lineId?: string } | null>(null);
  const [lineEditorState, setLineEditorState] = useState<{ open: boolean; lineId: string | null }>({ open: false, lineId: null });
  const [editorColor, setEditorColor] = useState(lineSettings.color);
  const [editorWidth, setEditorWidth] = useState(lineSettings.width);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [handleY, setHandleY] = useState<number | null>(null);

  const draggingLineRef = useRef<{ lineId: string; offset: number } | null>(null);
  const horizontalLinesRef = useRef<HorizontalLine[]>([]);
  const dragHappenedRef = useRef(false);
  const doubleClickRef = useRef(false);

  const updateHandlePosition = useCallback(() => {
    if (!selectedLineId || !seriesRef.current) {
      setHandleY(null);
      return;
    }

    const line = horizontalLinesRef.current.find(l => l.id === selectedLineId);
    if (!line) {
      setSelectedLineId(null);
      setHandleY(null);
      return;
    }

    const coord = seriesRef.current.priceToCoordinate(line.price);
    if (coord === null || coord === undefined) {
      setHandleY(null);
      return;
    }

    setHandleY(coord);
  }, [selectedLineId]);

  useEffect(() => {
    horizontalLinesRef.current = horizontalLines;
    updateHandlePosition();
  }, [horizontalLines, updateHandlePosition]);

  useEffect(() => {
    setEditorColor(lineSettings.color);
    setEditorWidth(lineSettings.width);
  }, [lineSettings.color, lineSettings.width]);

  useEffect(() => {
    updateHandlePosition();
  }, [selectedLineId, updateHandlePosition]);

  useEffect(() => {
    setSelectedLineId(null);
    setHandleY(null);
  }, [ticker]);

  const clearHorizontalLines = useCallback(() => {
    setHorizontalLines(prevLines => {
      prevLines.forEach(line => {
        if (line.priceLine && seriesRef.current) {
          try {
            seriesRef.current.removePriceLine(line.priceLine);
          } catch (error) {
            console.warn('Failed to remove price line during cleanup:', error);
          }
        }
      });
      horizontalLinesRef.current = [];
      setHandleY(null);
      return [];
    });
  }, []);

  // 水平線設定の取得
  const lineOpacity = parseFloat((import.meta as any).env.VITE_HORIZONTAL_LINE_OPACITY || '0.8');
  const lineStyle = (import.meta as any).env.VITE_HORIZONTAL_LINE_STYLE || 'solid';
  
  // プリセットカラー
  const HORIZONTAL_LINE_COLORS = [
    { name: 'レジスタンス（強）', color: '#FF0000' },
    { name: 'レジスタンス（弱）', color: '#FF7F7F' },
    { name: 'リスク注意', color: '#FF6F61' },
    { name: 'サポート（強）', color: '#0055FF' },
    { name: 'サポート（弱）', color: '#5DA9FF' },
    { name: 'トレンドライン', color: '#6A5ACD' },
    { name: '注目ライン', color: '#00B894' },
    { name: 'ブレイク候補', color: '#F39C12' },
    { name: '押し目ライン', color: '#2ECC71' },
    { name: '戻り売りライン', color: '#E84393' },
    { name: '監視ライン', color: '#6C757D' },
    { name: 'カスタム', color: '#808080' }
  ];

  useEffect(() => {
    const styleCode = lineStyle === 'dashed' ? 2 : lineStyle === 'dotted' ? 3 : 0;
    horizontalLinesRef.current.forEach(line => {
      if (!line.priceLine) return;
      line.priceLine.applyOptions({
        color: line.color,
        lineWidth: (line.id === selectedLineId ? line.width + 1 : line.width) as any,
        lineStyle: styleCode,
        axisLabelVisible: true
      });
    });
  }, [horizontalLines, selectedLineId, lineStyle]);

  const addHorizontalLine = useCallback(async (price: number) => {
    if (!seriesRef.current) {
      return;
    }

    try {
      const drawing = await database.saveChartDrawing(
        ticker,
        timeFrame,
        'horizontal_line',
        {
          price,
          color: lineSettings.color,
          width: lineSettings.width
        },
        userId
      );

      if (drawing && seriesRef.current) {
        const styleCode = lineStyle === 'dashed' ? 2 : lineStyle === 'dotted' ? 3 : 0;
        const priceLine = seriesRef.current.createPriceLine({
          price,
          color: lineSettings.color,
          lineWidth: lineSettings.width as any,
          lineStyle: styleCode,
          axisLabelVisible: true,
          title: ''
        });

        setHorizontalLines(prev => [...prev, {
          id: drawing.id,
          price,
          color: lineSettings.color,
          width: lineSettings.width,
          priceLine
        }]);

        setSelectedLineId(drawing.id);
        const coord = seriesRef.current.priceToCoordinate(price);
        setHandleY(coord ?? null);
        chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
        chartRef.current?.timeScale().fitContent();
        onHorizontalLineAdded?.();
      }
    } catch (error) {
      console.error('[ChartPane] Failed to create horizontal line:', error);
    }
  }, [ticker, timeFrame, lineSettings.color, lineSettings.width, userId, lineStyle, onHorizontalLineAdded]);

const findLineNearCoordinate = useCallback((coordinateY: number) => {
  if (!seriesRef.current) {
    return null;
  }

  const tolerance = 6;
  for (const line of horizontalLinesRef.current) {
    const lineCoordinate = seriesRef.current.priceToCoordinate(line.price);
    if (lineCoordinate === null || lineCoordinate === undefined) {
      continue;
    }
    if (Math.abs(lineCoordinate - coordinateY) <= tolerance) {
      return line;
    }
  }

  return null;
}, []);

  const startDrag = useCallback((lineId: string, chartY: number) => {
    if (!seriesRef.current) {
      return;
    }

    const pointerPrice = seriesRef.current.coordinateToPrice(chartY);
    if (pointerPrice === null || pointerPrice === undefined) {
      return;
    }

    const line = horizontalLinesRef.current.find(l => l.id === lineId);
    if (!line) {
      return;
    }

    draggingLineRef.current = {
      lineId,
      offset: line.price - pointerPrice
    };

    dragHappenedRef.current = false;
    document.body.style.cursor = 'ns-resize';
  }, []);

  const handleMouseDownOnChart = useCallback((event: MouseEvent) => {
    if (!chartContainerRef.current || !seriesRef.current || lineEditorState.open) {
      return;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const targetLine = findLineNearCoordinate(y);

    if (!targetLine) {
      setSelectedLineId(null);
      setHandleY(null);
      return;
    }

    if (selectedLineId !== targetLine.id) {
      setSelectedLineId(targetLine.id);
      const coord = seriesRef.current.priceToCoordinate(targetLine.price);
      setHandleY(coord ?? null);
      event.preventDefault();
      return;
    }

    startDrag(targetLine.id, y);
    event.preventDefault();
  }, [findLineNearCoordinate, lineEditorState.open, selectedLineId, startDrag]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const drag = draggingLineRef.current;
    if (!drag || !chartContainerRef.current || !seriesRef.current) {
      return;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const pointerPrice = seriesRef.current.coordinateToPrice(y);

    if (pointerPrice === null || pointerPrice === undefined) {
      return;
    }

    const newPrice = pointerPrice + drag.offset;

    setHorizontalLines(prev => {
      const updated = prev.map(line => {
        if (line.id !== drag.lineId) return line;

        if (line.priceLine) {
          line.priceLine.applyOptions({ price: newPrice });
        }

        return { ...line, price: newPrice };
      });

      horizontalLinesRef.current = updated;
      return updated;
    });
    dragHappenedRef.current = true;
    const coord = seriesRef.current.priceToCoordinate(newPrice);
    setHandleY(coord ?? null);
  }, []);

  const handleMouseUp = useCallback(async () => {
    const drag = draggingLineRef.current;
    if (!drag) {
      return;
    }

    draggingLineRef.current = null;
    document.body.style.cursor = 'default';

    const targetLine = horizontalLinesRef.current.find(line => line.id === drag.lineId);
    if (!targetLine) {
      dragHappenedRef.current = false;
      return;
    }

    try {
      await database.updateChartDrawing(drag.lineId, { price: targetLine.price }, userId);
      onHorizontalLineAdded?.();
    } catch (error) {
      console.error('[ChartPane] Failed to persist dragged horizontal line:', error);
    }
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
    updateHandlePosition();
    dragHappenedRef.current = false;
  }, [onHorizontalLineAdded, userId, updateHandlePosition]);

  // チャートの初期化
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartOptions = {
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
      } as any,
      localization: {
        priceFormatter: (price: number) => Math.round(price).toString()
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
        updateHandlePosition();
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
  }, [onCrosshairMove, title, updateHandlePosition]);

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
            open: Math.round(data.open),
            high: Math.round(data.high),
            low: Math.round(data.low),
            close: Math.round(data.close)
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

            setTimeout(() => {
              if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
              }
            }, 0);
          } else {
            chartRef.current.timeScale().fitContent();
          }

          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
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

  // 水平線を読み込む
  useEffect(() => {
    if (!ticker || !seriesRef.current) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || !seriesRef.current) {
        return;
      }

      clearHorizontalLines();

      try {
        const drawings = await database.getChartDrawings(ticker, timeFrame, userId);
        if (cancelled || !seriesRef.current) {
          return;
        }

        const uniqueLines: HorizontalLine[] = [];
        const seenIds = new Set<string>();

        drawings.forEach(d => {
          if (!d || !d.id || seenIds.has(d.id) || !seriesRef.current) {
            return;
          }

          seenIds.add(d.id);

          try {
            const priceValue = typeof d.data.price === 'number' ? d.data.price : Number(d.data.price);
            if (!Number.isFinite(priceValue)) {
              return;
            }

            const colorValue = d.data.color || lineSettings.color;
            const widthValue = Number.isFinite(d.data.width) ? Number(d.data.width) : lineSettings.width;

            const priceLine = seriesRef.current.createPriceLine({
              price: priceValue,
              color: colorValue,
              lineWidth: widthValue as any,
              lineStyle: lineStyle === 'dashed' ? 2 : lineStyle === 'dotted' ? 3 : 0,
              axisLabelVisible: true,
              title: ''
            });

            uniqueLines.push({
              id: d.id,
              price: priceValue,
              color: colorValue,
              width: widthValue,
              priceLine
            });
          } catch (error) {
            console.warn('Failed to create price line:', error);
          }
        });

        if (!cancelled) {
          setHorizontalLines(uniqueLines);
          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
        }
      } catch (error) {
        console.error('Failed to load horizontal lines:', error);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ticker, timeFrame, userId, lineSettings.color, lineSettings.width, lineStyle, horizontalLineUpdate, clearHorizontalLines]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }

    const handleMouseDownListener = (event: MouseEvent) => handleMouseDownOnChart(event);
    const handleMouseMoveListener = (event: MouseEvent) => handleMouseMove(event);
    const handleMouseUpListener = () => handleMouseUp();

    container.addEventListener('mousedown', handleMouseDownListener);
    window.addEventListener('mousemove', handleMouseMoveListener);
    window.addEventListener('mouseup', handleMouseUpListener);

    return () => {
      container.removeEventListener('mousedown', handleMouseDownListener);
      window.removeEventListener('mousemove', handleMouseMoveListener);
      window.removeEventListener('mouseup', handleMouseUpListener);
      document.body.style.cursor = 'default';
      draggingLineRef.current = null;
    };
  }, [handleMouseDownOnChart, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      clearHorizontalLines();
    };
  }, [clearHorizontalLines]);

  // チャートクリック時の処理
  const handleChartClick = useCallback(async (param: any) => {
    if (!param.point || !seriesRef.current) {
      return;
    }

    if (doubleClickRef.current) {
      return;
    }

    if (dragHappenedRef.current) {
      dragHappenedRef.current = false;
      return;
    }

    if (!horizontalLineMode) {
      const line = findLineNearCoordinate(param.point.y);
      if (line) {
        setSelectedLineId(line.id);
        const coord = seriesRef.current.priceToCoordinate(line.price);
        setHandleY(coord ?? null);
      } else {
        setSelectedLineId(null);
        setHandleY(null);
      }
      return;
    }

    const price = seriesRef.current.coordinateToPrice(param.point.y);
    if (price === null || price === undefined) {
      return;
    }

    await addHorizontalLine(price);
  }, [horizontalLineMode, findLineNearCoordinate, addHorizontalLine]);

  // 色選択後の処理
  const handleColorSelect = useCallback((color: string) => {
    setEditorColor(color);
  }, []);

  const handleHandleMouseDown = useCallback((lineId: string) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = chartContainerRef.current.getBoundingClientRect();
    const y = event.clientY - rect.top;
    setSelectedLineId(lineId);
    startDrag(lineId, y);
    setHandleY(y);
  }, [startDrag]);

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current || !seriesRef.current) {
      return;
    }

    const rect = chartContainerRef.current.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const price = seriesRef.current.coordinateToPrice(y);

    if (price === null || price === undefined) {
      return;
    }

    doubleClickRef.current = true;
    event.preventDefault();
    addHorizontalLine(price);
    requestAnimationFrame(() => {
      doubleClickRef.current = false;
    });
  }, [addHorizontalLine]);

  const openLineEditor = useCallback((lineId: string) => {
    const target = horizontalLinesRef.current.find(line => line.id === lineId);
    if (!target) {
      return;
    }

    setEditorColor(target.color);
    setEditorWidth(target.width);
    setLineEditorState({ open: true, lineId });
    setContextMenu(null);
  }, []);

  const handleEditorCancel = useCallback(() => {
    setLineEditorState({ open: false, lineId: null });
  }, []);

  const handleEditorConfirm = useCallback(async () => {
    if (!lineEditorState.lineId) {
      return;
    }

    setHorizontalLines(prev => {
      const updated = prev.map(line => {
        if (line.id !== lineEditorState.lineId) {
          return line;
        }

        if (line.priceLine) {
          line.priceLine.applyOptions({
            color: editorColor,
            lineWidth: editorWidth as any
          });
        }

        return {
          ...line,
          color: editorColor,
          width: editorWidth
        };
      });

      horizontalLinesRef.current = updated;
      return updated;
    });

    try {
      await database.updateChartDrawing(lineEditorState.lineId, {
        color: editorColor,
        width: editorWidth
      }, userId);
      onHorizontalLineAdded?.();
    } catch (error) {
      console.error('[ChartPane] Failed to update horizontal line:', error);
    }

    setLineEditorState({ open: false, lineId: null });
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    updateHandlePosition();
  }, [editorColor, editorWidth, lineEditorState.lineId, onHorizontalLineAdded, userId, updateHandlePosition]);

  // 水平線削除処理
  const handleDeleteLine = useCallback(async (lineId: string) => {
    const success = await database.deleteChartDrawing(lineId, userId);
    if (success) {
      setHorizontalLines(prev => {
        const remaining = prev.filter(l => {
          if (l.id === lineId && l.priceLine) {
            seriesRef.current?.removePriceLine(l.priceLine);
          }
          return l.id !== lineId;
        });
        horizontalLinesRef.current = remaining;
        return remaining;
      });
      
      // 他のチャートも更新（削除の同期）
      onHorizontalLineAdded?.();
      if (selectedLineId === lineId) {
        setSelectedLineId(null);
        setHandleY(null);
      }
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    }
    setContextMenu(null);
    if (lineEditorState.lineId === lineId) {
      setLineEditorState({ open: false, lineId: null });
    }
  }, [onHorizontalLineAdded, lineEditorState.lineId, userId, selectedLineId]);

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
    
    if (clickedLine && seriesRef.current) {
      setSelectedLineId(clickedLine.id);
      const coord = seriesRef.current.priceToCoordinate(clickedLine.price);
      setHandleY(coord ?? null);
    }

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
          onDoubleClick={handleDoubleClick}
        />

        {selectedLineId && handleY !== null && (
          <div className="hl-handle-layer">
            <div
              className="hl-handle hl-handle-left"
              style={{ top: `${handleY - 6}px` }}
              onMouseDown={handleHandleMouseDown(selectedLineId)}
            />
            <div
              className="hl-handle hl-handle-center"
              style={{ top: `${handleY - 6}px` }}
              onMouseDown={handleHandleMouseDown(selectedLineId)}
            />
            <div
              className="hl-handle hl-handle-right"
              style={{ top: `${handleY - 6}px` }}
              onMouseDown={handleHandleMouseDown(selectedLineId)}
            />
            <div
              className="hl-handle-line"
              style={{ top: `${handleY - 1}px` }}
            />
          </div>
        )}
        
        {/* 水平線編集 */}
        {lineEditorState.open && (
          <div
            className="color-picker-overlay"
            onClick={handleEditorCancel}
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
            }}
          >
            <div
              className="color-picker-popup"
              onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                minWidth: '280px'
              }}
            >
              <h3 style={{ marginTop: 0 }}>水平線の設定</h3>
              <div className="color-options" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
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
                      border: editorColor === color ? '3px solid #000' : '2px solid #ccc',
                      opacity: lineOpacity,
                      boxSizing: 'border-box'
                    }}
                    title={name}
                  />
                ))}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>太さ: {editorWidth}px</label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={editorWidth}
                  onChange={(e) => setEditorWidth(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={handleEditorCancel}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    background: '#f8f9fa',
                    cursor: 'pointer'
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleEditorConfirm}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: '#007bff',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  適用
                </button>
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
              <>
                <button
                  onClick={() => openLineEditor(contextMenu.lineId!)}
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
                  色と太さを変更
                </button>
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
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartPane;
