-- stock_pricesテーブルから4桁の証券コードを調査

-- 1. 4桁の証券コードのみを取得（ユニーク）
SELECT DISTINCT ticker
FROM stock_prices 
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'  -- 数字のみ
ORDER BY ticker;

-- 2. 4桁証券コードのデータ件数を集計
SELECT 
    ticker,
    COUNT(*) as total_records,
    COUNT(CASE WHEN timeframe = '1D' THEN 1 END) as daily_records,
    COUNT(CASE WHEN timeframe = '1W' THEN 1 END) as weekly_records,
    COUNT(CASE WHEN timeframe = '1M' THEN 1 END) as monthly_records,
    MIN(date) as earliest_date,
    MAX(date) as latest_date
FROM stock_prices 
WHERE LENGTH(ticker) = 4 
  AND ticker ~ '^[0-9]+$'
GROUP BY ticker
ORDER BY total_records DESC;

-- 3. 4桁と5桁の対応関係を確認
SELECT 
    SUBSTRING(sp5.ticker, 1, 4) as four_digit,
    sp5.ticker as five_digit,
    COUNT(CASE WHEN sp4.ticker IS NOT NULL THEN 1 END) as four_digit_records,
    COUNT(sp5.ticker) as five_digit_records
FROM stock_prices sp5
LEFT JOIN stock_prices sp4 ON sp4.ticker = SUBSTRING(sp5.ticker, 1, 4)
WHERE LENGTH(sp5.ticker) = 5 
  AND sp5.ticker ~ '^[0-9]+$'
  AND sp5.ticker LIKE '%0'  -- 末尾が0
GROUP BY sp5.ticker, SUBSTRING(sp5.ticker, 1, 4)
HAVING COUNT(sp5.ticker) > 100  -- データが豊富な銘柄のみ
ORDER BY five_digit_records DESC
LIMIT 20;

-- 4. 4桁データのみ存在する銘柄（5桁対応なし）
SELECT DISTINCT sp4.ticker
FROM stock_prices sp4
WHERE LENGTH(sp4.ticker) = 4 
  AND sp4.ticker ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM stock_prices sp5 
    WHERE sp5.ticker = sp4.ticker || '0'
  )
ORDER BY sp4.ticker;