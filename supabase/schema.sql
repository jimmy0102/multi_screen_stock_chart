-- Database Schema for Multi-Screen Stock Chart App

-- ユーザープロファイル拡張
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 銘柄マスター
CREATE TABLE ticker_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  sector TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 株価データ
CREATE TABLE stock_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  date DATE NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1D', '1W', '1M', '4H', '1H')),
  open DECIMAL(10,2) NOT NULL,
  high DECIMAL(10,2) NOT NULL,
  low DECIMAL(10,2) NOT NULL,
  close DECIMAL(10,2) NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(ticker, date, timeframe)
);

-- ウォッチリスト
CREATE TABLE watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, ticker)
);

-- チャート描画オブジェクト
CREATE TABLE chart_drawings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1D', '1W', '1M', '4H', '1H')),
  type TEXT NOT NULL CHECK (type IN ('horizontal_line', 'trend_line', 'rectangle', 'text')),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- メモ
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_stock_prices_ticker_date ON stock_prices(ticker, date DESC);
CREATE INDEX idx_stock_prices_ticker_timeframe ON stock_prices(ticker, timeframe);
CREATE INDEX idx_watchlists_user_id ON watchlists(user_id);
CREATE INDEX idx_chart_drawings_user_ticker ON chart_drawings(user_id, ticker);
CREATE INDEX idx_notes_user_ticker ON notes(user_id, ticker);

-- Row Level Security (RLS) の設定
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー

-- ユーザープロファイル: 本人のみ読み書き
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 株価データ: 全員が読み取り可能
CREATE POLICY "Stock prices are viewable by everyone" ON stock_prices
  FOR SELECT USING (true);

-- ウォッチリスト: 本人のデータのみ
CREATE POLICY "Users can manage their own watchlists" ON watchlists
  FOR ALL USING (auth.uid() = user_id);

-- チャート描画: 本人のデータのみ
CREATE POLICY "Users can manage their own chart drawings" ON chart_drawings
  FOR ALL USING (auth.uid() = user_id);

-- メモ: 本人のデータのみ
CREATE POLICY "Users can manage their own notes" ON notes
  FOR ALL USING (auth.uid() = user_id);

-- 関数: ユーザープロファイル自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー: 新規ユーザー作成時にプロファイル作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 関数: updated_at自動更新
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー: updated_atカラムの自動更新
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trigger_ticker_master_updated_at
  BEFORE UPDATE ON ticker_master
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trigger_stock_prices_updated_at
  BEFORE UPDATE ON stock_prices
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trigger_chart_drawings_updated_at
  BEFORE UPDATE ON chart_drawings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trigger_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();