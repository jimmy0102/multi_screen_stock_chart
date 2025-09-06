-- 謎の4銘柄の正当性検証SQL
-- 25935, 50765, 94345, 94346 が実在する証券かを判定する

-- 1. 銘柄コードの分析（日本の証券コード体系に基づく）
SELECT 
  ticker,
  ticker as original_code,
  -- 4桁化（末尾0を除去）してticker_masterと照合
  CASE 
    WHEN LENGTH(ticker) = 5 AND RIGHT(ticker, 1) = '0' 
    THEN LEFT(ticker, 4)
    ELSE ticker 
  END as four_digit_version,
  -- ticker_masterに対応する4桁コードがあるかチェック
  EXISTS(
    SELECT 1 FROM ticker_master 
    WHERE symbol = CASE 
      WHEN LENGTH(ticker) = 5 AND RIGHT(ticker, 1) = '0' 
      THEN LEFT(ticker, 4)
      ELSE ticker 
    END
  ) as has_master_entry,
  -- 業種分類推定
  CASE 
    WHEN ticker LIKE '1%' THEN '水産・農林業系'
    WHEN ticker LIKE '2%' THEN '鉱業系' 
    WHEN ticker LIKE '3%' THEN '建設業系'
    WHEN ticker LIKE '4%' THEN '食料品系'
    WHEN ticker LIKE '5%' THEN '繊維製品系'
    WHEN ticker LIKE '6%' THEN '機械系'
    WHEN ticker LIKE '7%' THEN '輸送用機器系'
    WHEN ticker LIKE '8%' THEN '商業系'
    WHEN ticker LIKE '9%' THEN '金融・保険系'
    ELSE '不明/特殊'
  END as estimated_sector
FROM (
  SELECT DISTINCT ticker 
  FROM stock_prices 
  WHERE ticker IN ('25935', '50765', '94345', '94346')
) mystery_codes
ORDER BY ticker;

-- 2. REITや特殊証券の可能性チェック
-- J-REITは通常8桁だが、5桁の特殊コードもある可能性
WITH ticker_patterns AS (
  SELECT 
    ticker,
    -- 一般的な日本の証券コードパターン
    CASE 
      WHEN ticker ~ '^[1-9][0-9]{3}0$' THEN '標準株式（5桁形式）'
      WHEN ticker ~ '^[1-9][0-9]{4}$' AND ticker NOT LIKE '%0' THEN '非標準5桁'
      WHEN LENGTH(ticker) = 4 THEN '4桁コード'
      ELSE '特殊形式'
    END as pattern_type,
    -- REITの可能性（通常8桁だが例外あり）
    CASE
      WHEN ticker IN (
        SELECT symbol FROM ticker_master 
        WHERE company_name ILIKE '%リート%' 
           OR company_name ILIKE '%REIT%'
           OR company_name ILIKE '%投資法人%'
      ) THEN 'REIT確認'
      ELSE '一般株式想定'
    END as security_type_estimate
  FROM (
    SELECT DISTINCT ticker 
    FROM stock_prices 
    WHERE ticker IN ('25935', '50765', '94345', '94346')
  ) t
)
SELECT * FROM ticker_patterns ORDER BY ticker;

-- 3. データ品質による正当性判定
WITH data_quality AS (
  SELECT 
    ticker,
    COUNT(*) as total_records,
    MIN(date) as start_date,
    MAX(date) as end_date,
    -- 価格の妥当性（日本株として）
    MIN(close) as min_price,
    MAX(close) as max_price,
    AVG(close) as avg_price,
    -- 出来高の妥当性
    AVG(volume) as avg_volume,
    COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_days,
    COUNT(CASE WHEN volume > 0 THEN 1 END) as trading_days,
    -- データの連続性
    COUNT(CASE WHEN DATE(date + INTERVAL '1 day') NOT IN (
      SELECT DISTINCT date FROM stock_prices sp2 
      WHERE sp2.ticker = stock_prices.ticker 
        AND sp2.timeframe = '1D'
    ) AND date < (SELECT MAX(date) FROM stock_prices sp3 WHERE sp3.ticker = stock_prices.ticker)
    THEN 1 END) as missing_days,
    -- 小数点の存在（日本株は通常整数）
    COUNT(CASE WHEN close::text LIKE '%.%' THEN 1 END) as decimal_prices
  FROM stock_prices 
  WHERE ticker IN ('25935', '50765', '94345', '94346')
    AND timeframe = '1D'
  GROUP BY ticker
)
SELECT 
  ticker,
  total_records,
  start_date,
  end_date,
  ROUND(avg_price::numeric, 0) as avg_price,
  ROUND(avg_volume::numeric, 0) as avg_volume,
  -- 正当性スコア計算
  CASE 
    WHEN avg_price BETWEEN 100 AND 50000 THEN 1 ELSE 0 
  END +
  CASE 
    WHEN avg_volume > 1000 THEN 1 ELSE 0 
  END +
  CASE 
    WHEN zero_volume_days::float / total_records < 0.1 THEN 1 ELSE 0 
  END +
  CASE 
    WHEN decimal_prices = 0 THEN 1 ELSE 0 
  END +
  CASE 
    WHEN total_records > 100 THEN 1 ELSE 0 
  END as legitimacy_score,
  -- 判定理由
  CONCAT(
    CASE WHEN avg_price < 100 OR avg_price > 50000 THEN '価格異常, ' ELSE '' END,
    CASE WHEN avg_volume <= 1000 THEN '出来高低, ' ELSE '' END,
    CASE WHEN zero_volume_days::float / total_records >= 0.1 THEN '取引停止多, ' ELSE '' END,
    CASE WHEN decimal_prices > 0 THEN '小数点価格, ' ELSE '' END,
    CASE WHEN total_records <= 100 THEN 'データ不足, ' ELSE '' END
  ) as issues
FROM data_quality
ORDER BY legitimacy_score DESC, ticker;

-- 4. 類似する正常銘柄との比較
WITH mystery_stats AS (
  SELECT 
    'mystery' as type,
    ticker,
    AVG(close) as avg_close,
    AVG(volume) as avg_volume,
    STDDEV(close) as price_volatility,
    COUNT(*) as data_points
  FROM stock_prices 
  WHERE ticker IN ('25935', '50765', '94345', '94346')
    AND timeframe = '1D'
    AND date >= '2024-01-01'
  GROUP BY ticker
),
normal_stats AS (
  SELECT 
    'normal' as type,
    ticker,
    AVG(close) as avg_close,
    AVG(volume) as avg_volume,
    STDDEV(close) as price_volatility,
    COUNT(*) as data_points
  FROM stock_prices 
  WHERE ticker IN (
    SELECT symbol || '0' FROM ticker_master 
    WHERE symbol IN ('1301', '6758', '7203', '8001', '9432')
  )
    AND timeframe = '1D'
    AND date >= '2024-01-01'
  GROUP BY ticker
)
SELECT 
  type,
  ticker,
  ROUND(avg_close::numeric, 0) as avg_price,
  ROUND(avg_volume::numeric, 0) as avg_volume,
  ROUND(price_volatility::numeric, 0) as volatility,
  data_points,
  -- 正常銘柄と比較した異常度
  CASE 
    WHEN type = 'mystery' THEN
      CASE 
        WHEN avg_close < 50 OR avg_close > 100000 THEN '価格異常'
        WHEN avg_volume < 100 THEN '出来高異常'
        WHEN price_volatility / avg_close > 0.5 THEN '変動異常'
        ELSE '正常範囲'
      END
    ELSE '基準'
  END as anomaly_status
FROM mystery_stats
UNION ALL 
SELECT 
  type,
  ticker,
  ROUND(avg_close::numeric, 0),
  ROUND(avg_volume::numeric, 0),
  ROUND(price_volatility::numeric, 0),
  data_points,
  '基準'
FROM normal_stats
ORDER BY type, ticker;

-- 5. 最終判定サマリー
WITH final_assessment AS (
  SELECT 
    ticker,
    CASE 
      WHEN LENGTH(ticker) = 5 AND RIGHT(ticker, 1) = '0' AND 
           EXISTS(SELECT 1 FROM ticker_master WHERE symbol = LEFT(ticker, 4))
      THEN '正当（ticker_master対応あり）'
      
      WHEN ticker ~ '^[1-9][0-9]{4}$' AND 
           (SELECT AVG(close) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) BETWEEN 100 AND 50000 AND
           (SELECT AVG(volume) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) > 1000
      THEN '正当の可能性（データ品質良好）'
      
      WHEN (SELECT COUNT(CASE WHEN date >= '2025-09-05' THEN 1 END) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) > 0
      THEN '疑問（2025-09-05に挿入されたデータ）'
      
      ELSE '要調査'
    END as final_judgment,
    
    (SELECT COUNT(*) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) as total_records,
    (SELECT MIN(date) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) as earliest_data,
    (SELECT MAX(date) FROM stock_prices WHERE stock_prices.ticker = mystery_list.ticker) as latest_data
    
  FROM (SELECT DISTINCT ticker FROM stock_prices WHERE ticker IN ('25935', '50765', '94345', '94346')) mystery_list
)
SELECT 
  ticker,
  final_judgment,
  total_records,
  earliest_data,
  latest_data,
  -- アクション推奨
  CASE 
    WHEN final_judgment LIKE '%正当%' THEN 'ticker_masterに追加検討'
    WHEN final_judgment LIKE '%疑問%' THEN 'データ削除検討' 
    ELSE 'さらなる調査必要'
  END as recommended_action
FROM final_assessment
ORDER BY 
  CASE final_judgment
    WHEN '正当（ticker_master対応あり）' THEN 1
    WHEN '正当の可能性（データ品質良好）' THEN 2  
    WHEN '疑問（2025-09-05に挿入されたデータ）' THEN 3
    ELSE 4
  END, ticker;