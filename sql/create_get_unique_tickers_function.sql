-- Create RPC function to efficiently get unique tickers from stock_prices
-- This function uses PostgreSQL's DISTINCT to get unique tickers more efficiently than client-side deduplication

CREATE OR REPLACE FUNCTION get_unique_tickers()
RETURNS TABLE (ticker text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT stock_prices.ticker
  FROM stock_prices
  WHERE stock_prices.timeframe = '1D'
  ORDER BY stock_prices.ticker;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_unique_tickers() TO authenticated;
GRANT EXECUTE ON FUNCTION get_unique_tickers() TO anon;