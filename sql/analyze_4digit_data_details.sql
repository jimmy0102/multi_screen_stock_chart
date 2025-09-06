-- 4桁データの詳細分析用SQLクエリ集

-- 1. 4桁データの基本統計
SELECT 
  ticker,
  COUNT(*) as total_records,
  MIN(date) as start_date,
  MAX(date) as end_date,
  ROUND(AVG(close), 2) as avg_price,
  MIN(close) as min_price,
  MAX(close) as max_price,
  ROUND(AVG(volume), 0) as avg_volume
FROM stock_prices
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'
  AND timeframe = '1D'
GROUP BY ticker
ORDER BY ticker;

-- 2. 小数点以下があるレコードを特定
SELECT 
  ticker,
  date,
  open,
  high,
  low,
  close,
  volume,
  CASE 
    WHEN open::text LIKE '%.%' THEN 'open'
    WHEN high::text LIKE '%.%' THEN 'high'
    WHEN low::text LIKE '%.%' THEN 'low'
    WHEN close::text LIKE '%.%' THEN 'close'
    ELSE 'none'
  END as decimal_field
FROM stock_prices
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'
  AND timeframe = '1D'
  AND (
    open::text LIKE '%.%' OR 
    high::text LIKE '%.%' OR 
    low::text LIKE '%.%' OR 
    close::text LIKE '%.%'
  )
ORDER BY ticker, date DESC;

-- 3. 4桁と5桁データの価格比較（同じ日付）
SELECT 
  f4.ticker as four_digit,
  f5.ticker as five_digit,
  f4.date,
  f4.close as four_digit_close,
  f5.close as five_digit_close,
  ABS(f4.close - f5.close) as price_diff,
  ROUND(ABS(f4.close - f5.close) / f5.close * 100, 2) as diff_percent
FROM stock_prices f4
JOIN stock_prices f5 ON f5.ticker = f4.ticker || '0' AND f5.date = f4.date
WHERE LENGTH(f4.ticker) = 4 
  AND f4.timeframe = '1D'
  AND f5.timeframe = '1D'
ORDER BY f4.ticker, f4.date DESC;

-- 4. 4桁データのcreated_at分析（いつ挿入されたか）
SELECT 
  ticker,
  DATE(created_at) as insert_date,
  COUNT(*) as records_inserted,
  MIN(date) as data_start_date,
  MAX(date) as data_end_date
FROM stock_prices
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'
  AND timeframe = '1D'
GROUP BY ticker, DATE(created_at)
ORDER BY ticker, insert_date;

-- 5. 全時間足での4桁データ分析
SELECT 
  ticker,
  timeframe,
  COUNT(*) as record_count,
  MIN(date) as start_date,
  MAX(date) as end_date,
  COUNT(CASE WHEN open::text LIKE '%.%' OR high::text LIKE '%.%' OR low::text LIKE '%.%' OR close::text LIKE '%.%' THEN 1 END) as decimal_records
FROM stock_prices
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'
GROUP BY ticker, timeframe
ORDER BY ticker, 
  CASE timeframe 
    WHEN '1D' THEN 1 
    WHEN '1W' THEN 2 
    WHEN '1M' THEN 3 
    ELSE 4 
  END;

-- 6. 重複データの詳細（同じ日付で4桁と5桁両方存在）
SELECT 
  f4.ticker as four_digit,
  f5.ticker as five_digit,
  COUNT(*) as duplicate_days,
  MIN(f4.date) as overlap_start,
  MAX(f4.date) as overlap_end
FROM stock_prices f4
JOIN stock_prices f5 ON f5.ticker = f4.ticker || '0' AND f5.date = f4.date AND f5.timeframe = f4.timeframe
WHERE LENGTH(f4.ticker) = 4 
  AND f4.timeframe = '1D'
GROUP BY f4.ticker, f5.ticker
ORDER BY f4.ticker;