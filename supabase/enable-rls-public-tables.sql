-- stock_pricesとticker_masterテーブルのRLSを有効にする（警告を消す）
-- これらは公開データなので、全員が読み取り可能なポリシーを設定

-- RLSを有効化
ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticker_master ENABLE ROW LEVEL SECURITY;

-- 全員が読み取り可能なポリシーを作成
CREATE POLICY "Public read access for stock prices" ON stock_prices
  FOR SELECT USING (true);

CREATE POLICY "Public read access for ticker master" ON ticker_master
  FOR SELECT USING (true);

-- 管理者のみ書き込み可能（service_roleまたはGitHub Actions用）
CREATE POLICY "Service role can manage stock prices" ON stock_prices
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage ticker master" ON ticker_master
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');