-- ticker_masterとstock_pricesの銘柄差分を洗い出すクエリ

-- 1. stock_pricesにあるがticker_masterにない銘柄（4銘柄の候補）
WITH stock_tickers AS (
  SELECT DISTINCT ticker
  FROM stock_prices
  WHERE timeframe = '1D'
),
master_tickers AS (
  SELECT DISTINCT symbol as ticker
  FROM ticker_master
),
master_5digit AS (
  SELECT DISTINCT (symbol || '0') as ticker
  FROM ticker_master
)
SELECT 
  st.ticker,
  CASE 
    WHEN LENGTH(st.ticker) = 4 THEN '4桁コード'
    WHEN LENGTH(st.ticker) = 5 THEN '5桁コード' 
    ELSE 'その他'
  END as ticker_type,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = st.ticker AND timeframe = '1D') as daily_records,
  (SELECT MIN(date) FROM stock_prices WHERE ticker = st.ticker AND timeframe = '1D') as start_date,
  (SELECT MAX(date) FROM stock_prices WHERE ticker = st.ticker AND timeframe = '1D') as end_date,
  'stock_pricesのみ存在' as status
FROM stock_tickers st
WHERE st.ticker NOT IN (SELECT ticker FROM master_tickers)
  AND st.ticker NOT IN (SELECT ticker FROM master_5digit)
ORDER BY st.ticker;

-- 2. ticker_masterにあるがstock_pricesにない銘柄（逆パターンもチェック）
WITH stock_tickers AS (
  SELECT DISTINCT ticker
  FROM stock_prices
  WHERE timeframe = '1D'
),
master_tickers AS (
  SELECT DISTINCT symbol as ticker
  FROM ticker_master
),
master_5digit AS (
  SELECT DISTINCT (symbol || '0') as ticker
  FROM ticker_master
)
SELECT 
  mt.ticker,
  '4桁コード（ticker_master）' as ticker_type,
  0 as daily_records,
  NULL as start_date,
  NULL as end_date,
  'ticker_masterのみ存在' as status
FROM master_tickers mt
WHERE mt.ticker NOT IN (SELECT ticker FROM stock_tickers)
  AND (mt.ticker || '0') NOT IN (SELECT ticker FROM stock_tickers)
ORDER BY mt.ticker;

-- 3. 詳細分析：4銘柄の正体を特定
WITH stock_unique AS (
  SELECT DISTINCT ticker
  FROM stock_prices
  WHERE timeframe = '1D'
),
master_4digit AS (
  SELECT DISTINCT symbol as ticker
  FROM ticker_master
),
master_5digit AS (
  SELECT DISTINCT (symbol || '0') as ticker  
  FROM ticker_master
)
SELECT 
  'stock_pricesユニーク銘柄数' as category,
  COUNT(*) as count
FROM stock_unique

UNION ALL

SELECT 
  'ticker_master銘柄数' as category,
  COUNT(*) as count
FROM master_4digit

UNION ALL

SELECT 
  'ticker_master対応5桁数' as category,
  COUNT(*) as count
FROM master_5digit

UNION ALL

SELECT 
  'stock_pricesのみに存在' as category,
  COUNT(*) as count
FROM stock_unique su
WHERE su.ticker NOT IN (SELECT ticker FROM master_4digit)
  AND su.ticker NOT IN (SELECT ticker FROM master_5digit)

UNION ALL

SELECT 
  'ticker_masterのみに存在' as category,
  COUNT(*) as count
FROM master_4digit md
WHERE md.ticker NOT IN (SELECT ticker FROM stock_unique)
  AND (md.ticker || '0') NOT IN (SELECT ticker FROM stock_unique);

-- 4. 謎の4銘柄の詳細データ
WITH mystery_tickers AS (
  SELECT DISTINCT sp.ticker
  FROM stock_prices sp
  WHERE sp.timeframe = '1D'
    AND sp.ticker NOT IN (SELECT symbol FROM ticker_master)
    AND sp.ticker NOT IN (SELECT symbol || '0' FROM ticker_master)
)
SELECT 
  mt.ticker,
  LENGTH(mt.ticker) as ticker_length,
  mt.ticker ~ '^[0-9]+$' as is_numeric,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = mt.ticker AND timeframe = '1D') as daily_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = mt.ticker AND timeframe = '1W') as weekly_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = mt.ticker AND timeframe = '1M') as monthly_count,
  (SELECT MIN(date) FROM stock_prices WHERE ticker = mt.ticker) as earliest_date,
  (SELECT MAX(date) FROM stock_prices WHERE ticker = mt.ticker) as latest_date,
  (SELECT MIN(created_at) FROM stock_prices WHERE ticker = mt.ticker) as first_inserted,
  (SELECT MAX(created_at) FROM stock_prices WHERE ticker = mt.ticker) as last_inserted
FROM mystery_tickers mt
ORDER BY mt.ticker;