import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { TimeFrame, StockData, ChartOptions } from '../types';

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

    const chart = createChart(chartContainerRef.current, chartOptions);
    const series = chart.addCandlestickSeries({
      upColor: '#4caf50',
      downColor: '#f44336',
      borderDownColor: '#f44336',
      borderUpColor: '#4caf50',
      wickDownColor: '#f44336',
      wickUpColor: '#4caf50'
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
        // 初回は全データ取得（キャッシュ）、2回目以降は直近500件に制限
        const isFirstLoad = !seriesRef.current?.data().length;
        const limit = isFirstLoad ? undefined : 500;
        const stockData = await window.electronAPI.getStockData(ticker, timeFrame, limit);
        
        if (stockData.length === 0) {
          setError(`${timeFrame} データがありません`);
          seriesRef.current?.setData([]);
          return;
        }

        // データをlightweight-charts形式に変換
        const chartData: CandlestickData[] = stockData
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map((data: StockData) => ({
            time: Math.floor(new Date(data.timestamp).getTime() / 1000) as any,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close
          }))
          .filter((data, index, array) => {
            // 重複するタイムスタンプを除去
            return index === 0 || data.time !== array[index - 1].time;
          });

        console.log(`Setting ${chartData.length} data points for ${ticker} ${timeFrame}`);
        seriesRef.current?.setData(chartData);
        
        // 統一された表示範囲を設定（直近100本のロウソク足を表示）
        if (chartRef.current && chartData.length > 0) {
          const visibleBars = 100; // 全時間足で統一した表示本数
          
          if (chartData.length > visibleBars) {
            // 直近100本分のデータ範囲を計算
            const lastIndex = chartData.length - 1;
            const firstVisibleIndex = Math.max(0, lastIndex - visibleBars + 1);
            
            const from = chartData[firstVisibleIndex].time;
            const to = chartData[lastIndex].time;
            
            // 表示範囲を設定
            chartRef.current.timeScale().setVisibleRange({
              from: from as any,
              to: to as any
            });
          } else {
            // データが少ない場合は全体を表示
            chartRef.current.timeScale().fitContent();
          }
          
          // 少し右側にパディングを追加
          setTimeout(() => {
            if (chartRef.current && chartData.length > visibleBars) {
              // 右側に少し余白を追加（5本分）
              const lastIndex = chartData.length - 1;
              const firstVisibleIndex = Math.max(0, lastIndex - visibleBars - 5);
              const paddedTo = chartData[Math.min(lastIndex, lastIndex + 5)]?.time || chartData[lastIndex].time;
              
              chartRef.current.timeScale().setVisibleRange({
                from: chartData[firstVisibleIndex].time as any,
                to: paddedTo as any
              });
            }
          }, 100);
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