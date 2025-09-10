-- 株価データ品質保証のためのDB制約とインデックス
-- 0価格防止・ユニークキー・高速化対応

-- 1. 一意キー制約（UPSERT前提）
ALTER TABLE public.stock_prices
  ADD CONSTRAINT IF NOT EXISTS uniq_stock_prices_ticker_tf_date
  UNIQUE (ticker, timeframe, date);

-- 2. 1Dデータの価格0/負値を禁止するCHECK制約
DO $add_constraint$
BEGIN
  -- 既存の制約があるかチェック
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname='ck_stock_prices_positive_1d' 
    AND conrelid = 'public.stock_prices'::regclass
  ) THEN
    ALTER TABLE public.stock_prices
      ADD CONSTRAINT ck_stock_prices_positive_1d
      CHECK (
        timeframe <> '1D' OR 
        (open > 0 AND high > 0 AND low > 0 AND close > 0)
      );
    RAISE NOTICE 'Added CHECK constraint: ck_stock_prices_positive_1d';
  ELSE
    RAISE NOTICE 'CHECK constraint already exists: ck_stock_prices_positive_1d';
  END IF;
END $add_constraint$;

-- 3. OHLC整合性チェック制約（high >= max(open,close), low <= min(open,close)）
DO $add_ohlc_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname='ck_stock_prices_ohlc_consistency' 
    AND conrelid = 'public.stock_prices'::regclass
  ) THEN
    ALTER TABLE public.stock_prices
      ADD CONSTRAINT ck_stock_prices_ohlc_consistency
      CHECK (
        high >= GREATEST(open, close) AND 
        low <= LEAST(open, close) AND
        volume >= 0
      );
    RAISE NOTICE 'Added CHECK constraint: ck_stock_prices_ohlc_consistency';
  ELSE
    RAISE NOTICE 'CHECK constraint already exists: ck_stock_prices_ohlc_consistency';
  END IF;
END $add_ohlc_constraint$;

-- 4. 高速化のためのインデックス

-- 4-1. 1D データの高速検索用（週足・月足集計で多用）
CREATE INDEX IF NOT EXISTS idx_sp_1d_ticker_date
  ON public.stock_prices (ticker, date) 
  WHERE timeframe='1D';

-- 4-2. 汎用的なticker + timeframe + date検索用
CREATE INDEX IF NOT EXISTS idx_sp_ticker_tf_date
  ON public.stock_prices (ticker, timeframe, date);

-- 4-3. 時系列分析用（銘柄別の日付ソート）
CREATE INDEX IF NOT EXISTS idx_sp_ticker_date_tf
  ON public.stock_prices (ticker, date, timeframe);

-- 4-4. 最新データ取得用（timeframe別の最新日付検索）
CREATE INDEX IF NOT EXISTS idx_sp_tf_date_desc
  ON public.stock_prices (timeframe, date DESC);

-- 5. 統計情報の更新（クエリプランナの最適化）
ANALYZE public.stock_prices;

-- 6. 制約とインデックスの確認
DO $check_constraints$
BEGIN
  RAISE NOTICE '=== 制約とインデックスの確認 ===';
  
  -- 制約の確認
  PERFORM 1 FROM information_schema.table_constraints 
  WHERE table_name = 'stock_prices' AND constraint_type = 'UNIQUE';
  IF FOUND THEN
    RAISE NOTICE '✅ UNIQUE制約: 設定済み';
  ELSE
    RAISE WARNING '❌ UNIQUE制約: 未設定';
  END IF;
  
  -- CHECK制約の確認  
  PERFORM 1 FROM pg_constraint 
  WHERE conname LIKE 'ck_stock_prices%' AND conrelid = 'public.stock_prices'::regclass;
  IF FOUND THEN
    RAISE NOTICE '✅ CHECK制約: 設定済み';
  ELSE
    RAISE WARNING '❌ CHECK制約: 未設定';
  END IF;
  
  -- インデックスの確認
  PERFORM 1 FROM pg_indexes 
  WHERE tablename = 'stock_prices' AND indexname LIKE 'idx_sp_%';
  IF FOUND THEN
    RAISE NOTICE '✅ 高速化インデックス: 設定済み';
  ELSE
    RAISE WARNING '❌ 高速化インデックス: 未設定';
  END IF;
  
  RAISE NOTICE '=== 確認完了 ===';
END $check_constraints$;

-- 7. テーブル情報の表示
\d+ public.stock_prices;