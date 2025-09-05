-- Fix RLS policies for public tables (ticker_master, stock_prices)
-- Allow read access without authentication

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access for stock prices" ON stock_prices;
DROP POLICY IF EXISTS "Public read access for ticker master" ON ticker_master;  
DROP POLICY IF EXISTS "Service role can manage stock prices" ON stock_prices;
DROP POLICY IF EXISTS "Service role can manage ticker master" ON ticker_master;

-- Create new policies: allow read access regardless of auth state
CREATE POLICY "Allow public read access to stock prices" ON stock_prices
  FOR SELECT USING (true);

CREATE POLICY "Allow public read access to ticker master" ON ticker_master  
  FOR SELECT USING (true);

-- Service role has full access
CREATE POLICY "Allow service role full access to stock prices" ON stock_prices
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Allow service role full access to ticker master" ON ticker_master
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Show current policies for verification
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('stock_prices', 'ticker_master')
ORDER BY tablename, policyname;