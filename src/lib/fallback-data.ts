// Supabase接続できない場合のフォールバックデータ
export const fallbackTickers = [
  { id: '1', symbol: '7203', name: 'トヨタ自動車', market: 'TSE', sector: '自動車', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '2', symbol: '9983', name: 'ファーストリテイリング', market: 'TSE', sector: '小売', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '3', symbol: '6758', name: 'ソニーグループ', market: 'TSE', sector: '電機', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '4', symbol: '9984', name: 'ソフトバンクグループ', market: 'TSE', sector: '通信', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '5', symbol: '6861', name: 'キーエンス', market: 'TSE', sector: '電機', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '6', symbol: '4063', name: '信越化学工業', market: 'TSE', sector: '化学', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '7', symbol: '9432', name: '日本電信電話', market: 'TSE', sector: '通信', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '8', symbol: '6098', name: 'リクルートホールディングス', market: 'TSE', sector: 'サービス', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '9', symbol: '8035', name: '東京エレクトロン', market: 'TSE', sector: '電機', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '10', symbol: '4519', name: '中外製薬', market: 'TSE', sector: '医薬品', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
];

// サンプル株価データを生成
export function generateSamplePriceData(ticker: string, timeframe: string = '1D', periods: number = 100) {
  const data = [];
  const now = new Date();
  let basePrice = 10000 + Math.random() * 50000;
  
  for (let i = periods; i >= 0; i--) {
    const date = new Date(now);
    
    // タイムフレームに応じて日付を調整
    if (timeframe === '1W') {
      // 週足: 7日ごと
      date.setDate(date.getDate() - (i * 7));
    } else if (timeframe === '1M') {
      // 月足: 30日ごと
      date.setMonth(date.getMonth() - i);
    } else {
      // 日足: 1日ごと
      date.setDate(date.getDate() - i);
      // 週末スキップ（日足のみ）
      if (date.getDay() === 0 || date.getDay() === 6) continue;
    }
    
    // 価格変動（週足・月足はより大きな変動）
    const volatility = timeframe === '1M' ? 0.08 : timeframe === '1W' ? 0.05 : 0.03;
    const change = (Math.random() - 0.48) * volatility;
    basePrice = basePrice * (1 + change);
    
    // OHLC生成（週足・月足はより大きなレンジ）
    const rangeMultiplier = timeframe === '1M' ? 0.03 : timeframe === '1W' ? 0.02 : 0.01;
    const open = basePrice * (1 + (Math.random() - 0.5) * rangeMultiplier);
    const close = basePrice * (1 + (Math.random() - 0.5) * rangeMultiplier);
    const high = Math.max(open, close) * (1 + Math.random() * rangeMultiplier);
    const low = Math.min(open, close) * (1 - Math.random() * rangeMultiplier);
    const volume = Math.floor(1000000 + Math.random() * 10000000) * (timeframe === '1M' ? 20 : timeframe === '1W' ? 5 : 1);
    
    data.push({
      id: `${ticker}-${date.toISOString()}`,
      ticker,
      date: date.toISOString().split('T')[0],
      timeframe,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  return data;
}