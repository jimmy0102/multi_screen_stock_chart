-- 謎の4銘柄のクリーンアップオプション
-- 対象: 25935, 50765, 94345, 94346

-- ⚠️ 注意: このクエリを実行する前に、必ずバックアップを取ってください
-- ⚠️ 実行前に検証クエリで内容を確認してから実行してください

-- =============================================================================
-- オプション1: 完全削除（疑わしいデータとして扱う場合）
-- =============================================================================

-- 1-1. 削除前の確認クエリ（必ず実行してください）
SELECT 
  '削除対象確認' as action,
  ticker,
  COUNT(*) as total_records,
  COUNT(CASE WHEN timeframe = '1D' THEN 1 END) as daily_records,
  COUNT(CASE WHEN timeframe = '1W' THEN 1 END) as weekly_records,
  COUNT(CASE WHEN timeframe = '1M' THEN 1 END) as monthly_records,
  MIN(date) as earliest_date,
  MAX(date) as latest_date,
  DATE(MIN(created_at)) as first_inserted,
  DATE(MAX(created_at)) as last_inserted
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
GROUP BY ticker
ORDER BY ticker;

-- 1-2. 削除対象レコード総数
SELECT 
  '総削除対象' as summary,
  COUNT(*) as total_records_to_delete,
  SUM(CASE WHEN timeframe = '1D' THEN 1 ELSE 0 END) as daily_to_delete,
  SUM(CASE WHEN timeframe = '1W' THEN 1 ELSE 0 END) as weekly_to_delete,
  SUM(CASE WHEN timeframe = '1M' THEN 1 ELSE 0 END) as monthly_to_delete
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346');

-- 1-3. 実際の削除クエリ（コメントアウト済み）
-- 以下のコメントを外して実行してください

-- -- 全時間足のデータを一括削除
-- DELETE FROM stock_prices 
-- WHERE ticker IN ('25935', '50765', '94345', '94346');

-- -- より安全な方法：1銘柄ずつ削除
-- DELETE FROM stock_prices WHERE ticker = '25935';
-- DELETE FROM stock_prices WHERE ticker = '50765'; 
-- DELETE FROM stock_prices WHERE ticker = '94345';
-- DELETE FROM stock_prices WHERE ticker = '94346';

-- =============================================================================
-- オプション2: ticker_masterに追加（正当な証券として扱う場合）
-- =============================================================================

-- 2-1. ticker_masterに追加する前の確認
-- これらの銘柄が実在するかを手動で調査してから実行してください

-- 2-2. ticker_masterに追加するクエリ（コメントアウト済み）
-- ⚠️ 以下は例です。実際の企業名や業種は手動調査が必要です

-- INSERT INTO ticker_master (symbol, company_name, sector, market) VALUES
-- ('2593', '調査要：25935の対応企業', '不明', 'TSE'),  -- 25935 → 2593
-- ('5076', '調査要：50765の対応企業', '不明', 'TSE'),  -- 50765 → 5076  
-- ('9434', '調査要：94345の対応企業', '不明', 'TSE'),  -- 94345 → 9434
-- ('9434', '調査要：94346の対応企業', '不明', 'TSE');  -- 94346 → 9434（重複？）

-- =============================================================================
-- オプション3: 一時的にフラグ付け（調査継続）
-- =============================================================================

-- 3-1. mystery_tickersテーブル作成（調査用）
-- CREATE TABLE IF NOT EXISTS mystery_tickers (
--   ticker VARCHAR(10) PRIMARY KEY,
--   discovered_date DATE DEFAULT CURRENT_DATE,
--   status VARCHAR(20) DEFAULT 'investigating',
--   notes TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- 3-2. 謎銘柄を調査テーブルに登録
-- INSERT INTO mystery_tickers (ticker, notes) VALUES
-- ('25935', '2020-2025年のデータ、1224件、平均価格要確認'),
-- ('50765', '2024-2025年のデータ、267件、平均価格要確認'),
-- ('94345', '2023-2025年のデータ、450件、平均価格要確認'),
-- ('94346', '2024-2025年のデータ、225件、平均価格要確認');

-- =============================================================================
-- 削除後の確認クエリ（削除実行後に使用）
-- =============================================================================

-- 削除が完了したことを確認
SELECT 
  '削除確認' as check_type,
  ticker,
  COUNT(*) as remaining_records
FROM stock_prices 
WHERE ticker IN ('25935', '50765', '94345', '94346')
GROUP BY ticker;
-- 結果が0件なら正常に削除完了

-- 全体の銘柄数確認（1620 → 1616になるはず）
SELECT 
  '全体確認' as check_type,
  COUNT(DISTINCT ticker) as unique_tickers
FROM stock_prices
WHERE timeframe = '1D';

-- ticker_masterとの整合性確認
WITH stock_unique AS (
  SELECT COUNT(DISTINCT ticker) as stock_count 
  FROM stock_prices WHERE timeframe = '1D'
),
master_count AS (
  SELECT COUNT(*) as master_count 
  FROM ticker_master
)
SELECT 
  '整合性確認' as check_type,
  stock_count,
  master_count,
  stock_count - master_count as difference,
  CASE 
    WHEN stock_count = master_count THEN '✅ 一致'
    WHEN stock_count > master_count THEN '❌ stock_pricesに余分'
    ELSE '❌ ticker_masterに余分'
  END as status
FROM stock_unique, master_count;

-- =============================================================================
-- 推奨アクション
-- =============================================================================

/*
判定基準：
1. 全て2025-09-05に挿入されたデータ
2. 対応するticker_masterエントリなし  
3. 長期間のデータ（2020-2025など）だが最近挿入
4. 価格・出来高データの妥当性は要確認

推奨：
- まず verify_mystery_ticker_legitimacy.sql で詳細分析
- データ品質が良好なら ticker_master への追加を検討
- データ品質が疑わしいなら削除を検討
- 不明な場合は一時的に mystery_tickers テーブルで管理

安全な実行順序：
1. analyze_mystery_tickers.sql で詳細分析
2. verify_mystery_ticker_legitimacy.sql で正当性判定  
3. このファイルで適切なオプションを選択して実行
*/