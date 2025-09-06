-- RLS（Row Level Security）を無効にするSQLクエリ
-- ticker_masterとstock_pricesテーブルは公開データなのでRLS不要

-- 1. ticker_masterテーブルのRLSを無効化
ALTER TABLE ticker_master DISABLE ROW LEVEL SECURITY;

-- 2. stock_pricesテーブルのRLSを無効化  
ALTER TABLE stock_prices DISABLE ROW LEVEL SECURITY;

-- 3. 確認クエリ（実行後に確認用）
-- RLSが無効になっているかチェック
SELECT 
  schemaname,
  tablename, 
  rowsecurity
FROM pg_tables 
WHERE tablename IN ('ticker_master', 'stock_prices')
  AND schemaname = 'public';

-- 4. 既存のRLSポリシーも削除（念のため）
-- ticker_masterに関連するポリシーがあれば削除
DROP POLICY IF EXISTS "ticker_master_select_policy" ON ticker_master;
DROP POLICY IF EXISTS "ticker_master_public_read" ON ticker_master;
DROP POLICY IF EXISTS "Allow public read access to ticker_master" ON ticker_master;

-- stock_pricesに関連するポリシーがあれば削除  
DROP POLICY IF EXISTS "stock_prices_select_policy" ON stock_prices;
DROP POLICY IF EXISTS "stock_prices_public_read" ON stock_prices;
DROP POLICY IF EXISTS "Allow public read access to stock_prices" ON stock_prices;
DROP POLICY IF EXISTS "Stock prices are viewable by everyone" ON stock_prices;

-- 5. 最終確認 - テーブルからのデータ取得テスト
-- これらのクエリがエラーなく実行できればRLS無効化成功

-- ticker_masterテーブルのテスト
SELECT COUNT(*) as ticker_master_count FROM ticker_master;

-- stock_pricesテーブルのテスト  
SELECT COUNT(*) as stock_prices_count FROM stock_prices LIMIT 1;

-- サンプルデータ取得テスト
SELECT * FROM ticker_master ORDER BY symbol LIMIT 5;
SELECT * FROM stock_prices ORDER BY date DESC LIMIT 3;