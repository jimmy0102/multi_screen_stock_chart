-- 4桁コードと5桁コード（末尾0）で両方データが存在する重複ペアを洗い出し

-- 1. 重複ペアの一覧
WITH four_digit_data AS (
  SELECT DISTINCT ticker
  FROM stock_prices 
  WHERE LENGTH(ticker) = 4 
    AND ticker ~ '^[0-9]+$'
    AND timeframe = '1D'
),
five_digit_data AS (
  SELECT DISTINCT ticker
  FROM stock_prices 
  WHERE LENGTH(ticker) = 5 
    AND ticker ~ '^[0-9]+$' 
    AND ticker LIKE '%0'
    AND timeframe = '1D'
)
SELECT 
  f4.ticker as four_digit_code,
  f5.ticker as five_digit_code,
  'DUPLICATE' as status
FROM four_digit_data f4
INNER JOIN five_digit_data f5 ON f5.ticker = f4.ticker || '0'
ORDER BY f4.ticker;

-- 2. 重複ペアの詳細データ量
WITH duplicate_pairs AS (
  SELECT DISTINCT f4.ticker as four_digit, f5.ticker as five_digit
  FROM stock_prices f4
  INNER JOIN stock_prices f5 ON f5.ticker = f4.ticker || '0'
  WHERE LENGTH(f4.ticker) = 4 
    AND LENGTH(f5.ticker) = 5
    AND f4.ticker ~ '^[0-9]+$'
    AND f5.ticker ~ '^[0-9]+$'
    AND f5.ticker LIKE '%0'
)
SELECT 
  dp.four_digit,
  dp.five_digit,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.four_digit AND timeframe = '1D') as four_digit_1d_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.five_digit AND timeframe = '1D') as five_digit_1d_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.four_digit AND timeframe = '1W') as four_digit_1w_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.five_digit AND timeframe = '1W') as five_digit_1w_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.four_digit AND timeframe = '1M') as four_digit_1m_count,
  (SELECT COUNT(*) FROM stock_prices WHERE ticker = dp.five_digit AND timeframe = '1M') as five_digit_1m_count
FROM duplicate_pairs dp
ORDER BY four_digit_1d_count DESC, five_digit_1d_count DESC;

-- 3. 重複データの日付範囲比較
WITH duplicate_pairs AS (
  SELECT DISTINCT f4.ticker as four_digit, f5.ticker as five_digit
  FROM stock_prices f4
  INNER JOIN stock_prices f5 ON f5.ticker = f4.ticker || '0'
  WHERE LENGTH(f4.ticker) = 4 
    AND LENGTH(f5.ticker) = 5
    AND f4.ticker ~ '^[0-9]+$'
    AND f5.ticker ~ '^[0-9]+$'
    AND f5.ticker LIKE '%0'
)
SELECT 
  dp.four_digit,
  dp.five_digit,
  (SELECT MIN(date) FROM stock_prices WHERE ticker = dp.four_digit) as four_digit_start,
  (SELECT MAX(date) FROM stock_prices WHERE ticker = dp.four_digit) as four_digit_end,
  (SELECT MIN(date) FROM stock_prices WHERE ticker = dp.five_digit) as five_digit_start,
  (SELECT MAX(date) FROM stock_prices WHERE ticker = dp.five_digit) as five_digit_end
FROM duplicate_pairs dp
ORDER BY dp.four_digit;