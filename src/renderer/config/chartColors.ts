// Chart color configuration
// これらの設定を変更することで、チャートの色をカスタマイズできます

export interface ChartColors {
  bullish: {
    body: string
    border: string  
    wick: string
  }
  bearish: {
    body: string
    border: string
    wick: string
  }
}

// 日本式（陽線：赤、陰線：青）
export const JAPANESE_COLORS: ChartColors = {
  bullish: {
    body: '#ff0000',
    border: '#ff0000', 
    wick: '#ff0000'
  },
  bearish: {
    body: '#0000ff',
    border: '#0000ff',
    wick: '#0000ff'
  }
}

// 欧米式（陽線：緑、陰線：赤）
export const WESTERN_COLORS: ChartColors = {
  bullish: {
    body: '#4caf50',
    border: '#4caf50',
    wick: '#4caf50'
  },
  bearish: {
    body: '#f44336',
    border: '#f44336',
    wick: '#f44336'
  }
}

// モノクローム（陽線：白、陰線：黒）
export const MONOCHROME_COLORS: ChartColors = {
  bullish: {
    body: '#ffffff',
    border: '#ffffff',
    wick: '#ffffff'
  },
  bearish: {
    body: '#000000',
    border: '#000000',
    wick: '#000000'
  }
}

// 現在使用する色設定（ここを変更してスタイルを切り替え）
export const CURRENT_COLORS = JAPANESE_COLORS

// 環境変数からの読み込みを試行し、失敗した場合は設定値を使用
export const getChartColors = (): ChartColors => {
  try {
    const envBullish = import.meta.env.VITE_CHART_BULLISH_COLOR
    const envBearish = import.meta.env.VITE_CHART_BEARISH_COLOR
    
    if (envBullish && envBearish) {
      return {
        bullish: {
          body: envBullish,
          border: import.meta.env.VITE_CHART_BULLISH_BORDER_COLOR || envBullish,
          wick: import.meta.env.VITE_CHART_BULLISH_WICK_COLOR || envBullish
        },
        bearish: {
          body: envBearish,
          border: import.meta.env.VITE_CHART_BEARISH_BORDER_COLOR || envBearish,
          wick: import.meta.env.VITE_CHART_BEARISH_WICK_COLOR || envBearish
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load environment variables for chart colors:', error)
  }
  
  return CURRENT_COLORS
}