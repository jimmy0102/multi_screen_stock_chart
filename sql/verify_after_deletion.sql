-- 4桁データ削除後の検証クエリ

-- 1. 4桁データが完全に削除されたことを確認
SELECT 
  ticker,
  COUNT(*) as remaining_4digit_records
FROM stock_prices 
WHERE ticker IN ('1301', '6758', '7203', '8001', '9432')
  AND LENGTH(ticker) = 4
GROUP BY ticker;
-- 結果が0件なら正常に削除完了

-- 2. 5桁データは残っていることを確認  
SELECT 
  ticker,
  timeframe,
  COUNT(*) as records,
  MIN(date) as start_date,
  MAX(date) as end_date
FROM stock_prices 
WHERE ticker IN ('13010', '67580', '72030', '80010', '94320')
GROUP BY ticker, timeframe
ORDER BY ticker, timeframe;

-- 3. 全体のレコード数を確認（削除前より少なくなっているはず）
SELECT 
  timeframe,
  COUNT(*) as total_records
FROM stock_prices
GROUP BY timeframe
ORDER BY timeframe;

-- 4. データベース全体の銘柄数を確認
SELECT COUNT(DISTINCT ticker) as unique_tickers
FROM stock_prices
WHERE timeframe = '1D';