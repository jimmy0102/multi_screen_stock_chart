-- 重複している4桁コードのデータを削除するSQLクエリ

-- ⚠️ 注意: このクエリを実行する前に、必ずバックアップを取ってください
-- ⚠️ 一度削除すると元に戻せません

-- 1. 削除対象データの事前確認（実行前に必ず確認してください）
SELECT 
  ticker,
  timeframe,
  COUNT(*) as records_to_delete,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM stock_prices 
WHERE ticker IN ('1301', '6758', '7203', '8001', '9432')
  AND LENGTH(ticker) = 4
GROUP BY ticker, timeframe
ORDER BY ticker, timeframe;

-- 2. 削除対象レコードの詳細確認
SELECT COUNT(*) as total_records_to_delete
FROM stock_prices 
WHERE ticker IN ('1301', '6758', '7203', '8001', '9432')
  AND LENGTH(ticker) = 4;

-- 3. 実際の削除クエリ（慎重に実行してください）
-- コメントアウトしています。実行する際は -- を削除してください

-- DELETE FROM stock_prices 
-- WHERE ticker IN ('1301', '6758', '7203', '8001', '9432')
--   AND LENGTH(ticker) = 4;

-- 4. 削除後の確認クエリ（削除実行後に確認用）
-- SELECT 
--   ticker,
--   timeframe,
--   COUNT(*) as remaining_records
-- FROM stock_prices 
-- WHERE ticker IN ('1301', '6758', '7203', '8001', '9432')
-- GROUP BY ticker, timeframe
-- ORDER BY ticker, timeframe;

-- 5. より安全な削除方法（1銘柄ずつ削除）
-- 一度に全て削除するのが心配な場合は、以下のように1銘柄ずつ削除してください

-- -- 1301の4桁データを削除
-- DELETE FROM stock_prices WHERE ticker = '1301' AND LENGTH(ticker) = 4;

-- -- 6758の4桁データを削除  
-- DELETE FROM stock_prices WHERE ticker = '6758' AND LENGTH(ticker) = 4;

-- -- 7203の4桁データを削除
-- DELETE FROM stock_prices WHERE ticker = '7203' AND LENGTH(ticker) = 4;

-- -- 8001の4桁データを削除
-- DELETE FROM stock_prices WHERE ticker = '8001' AND LENGTH(ticker) = 4;

-- -- 9432の4桁データを削除
-- DELETE FROM stock_prices WHERE ticker = '9432' AND LENGTH(ticker) = 4;