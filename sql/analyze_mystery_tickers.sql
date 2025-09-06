-- 4つの謎銘柄の詳細分析用SQLクエリ集
-- 対象銘柄: 25935, 50765, 94345, 94346

-- 1. 基本情報の詳細分析
SELECT 
  ticker,
  COUNT(*) as total_records,
  COUNT(CASE WHEN timeframe = '1D' THEN 1 END) as daily_records,
  COUNT(CASE WHEN timeframe = '1W' THEN 1 END) as weekly_records,
  COUNT(CASE WHEN timeframe = '1M' THEN 1 END) as monthly_records,
  MIN(date) as earliest_date,
  MAX(date) as latest_date,
  DATE(MIN(created_at)) as first_inserted,
  DATE(MAX(created_at)) as last_inserted,
  EXTRACT(days FROM MAX(date) - MIN(date)) as data_span_days
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
GROUP BY ticker
ORDER BY ticker;

-- 2. 価格データの妥当性チェック（日本株として適切な価格帯か）
SELECT 
  ticker,
  timeframe,
  MIN(close) as min_price,
  MAX(close) as max_price,
  ROUND(AVG(close), 0) as avg_price,
  ROUND(STDDEV(close), 0) as price_stddev,
  COUNT(CASE WHEN close < 100 THEN 1 END) as under_100_count,
  COUNT(CASE WHEN close BETWEEN 100 AND 1000 THEN 1 END) as normal_range_count,
  COUNT(CASE WHEN close > 10000 THEN 1 END) as over_10k_count,
  -- 小数点チェック（日本株は通常整数）
  COUNT(CASE WHEN close::text LIKE '%.%' THEN 1 END) as decimal_price_count
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
  AND timeframe = '1D'
GROUP BY ticker, timeframe
ORDER BY ticker;

-- 3. 出来高データの分析（実際の取引があるかの指標）
SELECT 
  ticker,
  MIN(volume) as min_volume,
  MAX(volume) as max_volume,
  ROUND(AVG(volume), 0) as avg_volume,
  COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_days,
  COUNT(CASE WHEN volume < 1000 THEN 1 END) as low_volume_days,
  COUNT(CASE WHEN volume > 1000000 THEN 1 END) as high_volume_days,
  ROUND(COUNT(CASE WHEN volume = 0 THEN 1 END)::numeric / COUNT(*) * 100, 1) as zero_volume_percent
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
  AND timeframe = '1D'
GROUP BY ticker
ORDER BY ticker;

-- 4. データの規則性チェック（サンプルデータの特徴を検出）
WITH daily_changes AS (
  SELECT 
    ticker,
    date,
    close,
    LAG(close) OVER (PARTITION BY ticker ORDER BY date) as prev_close,
    CASE 
      WHEN LAG(close) OVER (PARTITION BY ticker ORDER BY date) IS NOT NULL 
      THEN ABS((close - LAG(close) OVER (PARTITION BY ticker ORDER BY date)) / LAG(close) OVER (PARTITION BY ticker ORDER BY date) * 100)
      ELSE NULL 
    END as daily_change_percent
  FROM stock_prices 
  WHERE ticker IN ('25935', '50765', '94345', '94346')
    AND timeframe = '1D'
)
SELECT 
  ticker,
  COUNT(*) as total_days,
  COUNT(daily_change_percent) as change_days,
  ROUND(AVG(daily_change_percent), 2) as avg_daily_change,
  ROUND(MIN(daily_change_percent), 2) as min_daily_change,
  ROUND(MAX(daily_change_percent), 2) as max_daily_change,
  -- 異常に規則的な変動を検出
  COUNT(CASE WHEN ABS(daily_change_percent - 1.0) < 0.01 THEN 1 END) as exactly_1percent_days,
  COUNT(CASE WHEN ABS(daily_change_percent - 2.0) < 0.01 THEN 1 END) as exactly_2percent_days,
  COUNT(CASE WHEN daily_change_percent = 0 THEN 1 END) as no_change_days
FROM daily_changes
WHERE daily_change_percent IS NOT NULL
GROUP BY ticker
ORDER BY ticker;

-- 5. 最近のデータサンプル（実際のデータを目視確認）
SELECT 
  ticker,
  date,
  open,
  high, 
  low,
  close,
  volume,
  created_at
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
  AND timeframe = '1D'
  AND date >= '2025-08-01'  -- 最近1ヶ月のデータ
ORDER BY ticker, date DESC
LIMIT 40;

-- 6. 他の正常銘柄との比較（参考用）
-- ランダムに選んだ正常銘柄（13010など）と比較
WITH normal_ticker AS (
  SELECT 
    '13010' as ticker,
    'normal' as type,
    MIN(close) as min_price,
    MAX(close) as max_price,
    ROUND(AVG(close), 0) as avg_price,
    ROUND(AVG(volume), 0) as avg_volume,
    COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_days,
    COUNT(*) as total_days
  FROM stock_prices 
  WHERE ticker = '13010' AND timeframe = '1D'
    AND date >= '2024-01-01'
),
mystery_tickers AS (
  SELECT 
    ticker,
    'mystery' as type,
    MIN(close) as min_price,
    MAX(close) as max_price,
    ROUND(AVG(close), 0) as avg_price,
    ROUND(AVG(volume), 0) as avg_volume,
    COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_days,
    COUNT(*) as total_days
  FROM stock_prices 
  WHERE ticker IN ('25935', '50765', '94345', '94346')
    AND timeframe = '1D'
    AND date >= '2024-01-01'
  GROUP BY ticker
)
SELECT * FROM normal_ticker
UNION ALL
SELECT * FROM mystery_tickers
ORDER BY type, ticker;

-- 7. 銘柄コードの形式チェック（日本の証券コードの規則性）
SELECT 
  ticker,
  LENGTH(ticker) as code_length,
  ticker ~ '^[0-9]+$' as is_numeric_only,
  CASE 
    WHEN ticker ~ '^1[0-9]{4}$' THEN 'TSE 水産・農林業' 
    WHEN ticker ~ '^2[0-9]{4}$' THEN 'TSE 鉱業'
    WHEN ticker ~ '^3[0-9]{4}$' THEN 'TSE 建設業'
    WHEN ticker ~ '^4[0-9]{4}$' THEN 'TSE 食料品'
    WHEN ticker ~ '^5[0-9]{4}$' THEN 'TSE 繊維製品'
    WHEN ticker ~ '^6[0-9]{4}$' THEN 'TSE 機械'
    WHEN ticker ~ '^7[0-9]{4}$' THEN 'TSE 輸送用機器'
    WHEN ticker ~ '^8[0-9]{4}$' THEN 'TSE 商業'
    WHEN ticker ~ '^9[0-9]{4}$' THEN 'TSE 金融・保険'
    ELSE '不明な業種/形式'
  END as sector_classification,
  -- REITの可能性チェック（一般的に8桁や特殊コード）
  CASE 
    WHEN LENGTH(ticker) = 5 AND ticker ~ '^[0-9]+$' THEN '5桁数値コード'
    WHEN LENGTH(ticker) != 4 THEN '非標準長'
    ELSE '標準4桁'
  END as code_format
FROM (SELECT DISTINCT ticker FROM stock_prices WHERE ticker IN ('25935', '50765', '94345', '94346')) t
ORDER BY ticker;