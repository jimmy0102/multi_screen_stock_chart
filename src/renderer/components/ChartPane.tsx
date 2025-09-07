import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { TimeFrame, ChartOptions } from '../types';
import { getChartColors } from '../config/chartColors';

interface ChartPaneProps {
  ticker: string;
  timeFrame: TimeFrame;
  title: string;
  delay?: number; // 遅延読み込みのミリ秒
}

const ChartPane: React.FC<ChartPaneProps> = ({ ticker, timeFrame, title, delay = 0 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        mode: 1 // CrosshairMode.Normal
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

    return () => {
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

  return (
    <div className="chart-pane">
      <div className="chart-header">
        <div className="chart-title">
          {title} - {ticker}
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
            visibility: isLoading || error ? 'hidden' : 'visible'
          }}
        />
      </div>
    </div>
  );
};

export default ChartPane;