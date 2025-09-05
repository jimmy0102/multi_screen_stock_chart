import axios from 'axios';
import * as dotenv from 'dotenv';
import { DatabaseManager } from './database';

dotenv.config();

interface TwelveDataResponse {
  meta: {
    symbol: string;
    interval: string;
    currency: string;
    exchange_timezone: string;
    exchange: string;
    type: string;
  };
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status: string;
}

export class TwelveDataClient {
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';
  private db: DatabaseManager;
  private lastApiCallTime: number = 0;
  private apiCallCount: number = 0;
  private readonly CALLS_PER_MINUTE = 610; // プロプランの制限
  private readonly MINUTE_MS = 60000;
  
  constructor() {
    this.apiKey = process.env.TWELVE_DATA_API_KEY || '';
    if (!this.apiKey) {
      console.warn('TWELVE_DATA_API_KEY not found in environment variables');
    }
    this.db = new DatabaseManager();
  }
  
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    // 1分経過したらカウントリセット
    if (timeSinceLastCall >= this.MINUTE_MS) {
      this.apiCallCount = 0;
      this.lastApiCallTime = now;
    }
    
    // 制限に達したら次の分まで待つ
    if (this.apiCallCount >= this.CALLS_PER_MINUTE) {
      const waitTime = this.MINUTE_MS - timeSinceLastCall;
      if (waitTime > 0) {
        console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.apiCallCount = 0;
        this.lastApiCallTime = Date.now();
      }
    }
    
    this.apiCallCount++;
  }
  
  async getTimeSeries(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '1h' | '1day' | '1week' | '1month',
    outputsize: number = 500
  ): Promise<TwelveDataResponse | null> {
    // 5桁コードの場合、最後の0を削除して4桁にする
    let apiSymbol = symbol;
    if (symbol.length === 5 && symbol.endsWith('0')) {
      apiSymbol = symbol.slice(0, 4);
      console.log(`Converting ${symbol} to ${apiSymbol} for API call`);
    }
    
    try {
      // レート制限チェック
      await this.waitForRateLimit();
      
      // 東証の正式フォーマット: STOCK_CODE:JPX
      const response = await axios.get(`${this.baseUrl}/time_series`, {
        params: {
          symbol: `${apiSymbol}:JPX`,  // :JPXサフィックスを追加（東証・日本円）
          interval,
          outputsize,
          apikey: this.apiKey
        }
      });
      
      // JPX形式でデータが取得できたことをログ出力
      if (response.data.status !== 'error' && response.data.meta) {
        console.log(`Successfully fetched ${apiSymbol}:JPX (Currency: ${response.data.meta.currency || 'JPY'})`);
      }
      
      if (response.data.status === 'error') {
        console.error(`Error fetching ${apiSymbol} (original: ${symbol}):`, response.data.message);
        return null;
      }
      
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch time series for ${apiSymbol} (original: ${symbol}):`, error);
      return null;
    }
  }
  
  async fetchAndStoreStockData(symbol: string): Promise<boolean> {
    // 5桁コードの場合、最後の0を削除して4桁にする
    let apiSymbol = symbol;
    if (symbol.length === 5 && symbol.endsWith('0')) {
      apiSymbol = symbol.slice(0, 4);
      console.log(`Converting ${symbol} to ${apiSymbol} for fetchAndStoreStockData`);
    }
    
    try {
      const intervals = [
        { key: '1h', dbKey: '60m', outputsize: 2000 },   // 約1年分（8時間×250営業日）
        { key: '1day', dbKey: '1D', outputsize: 1825 },  // 5年分（365日×5年）
        { key: '1week', dbKey: '1W', outputsize: 260 },  // 5年分（52週×5年）
        { key: '1month', dbKey: '1M', outputsize: 60 }   // 5年分維持
      ];
      
      for (const { key, dbKey, outputsize } of intervals) {
        console.log(`Fetching ${dbKey} data for ${apiSymbol}:JPX...`);
        const data = await this.getTimeSeries(apiSymbol, key as any, outputsize);
        
        if (data && data.values) {
          const stockData = data.values
            .map(candle => ({
              ticker: symbol,
              timestamp: candle.datetime,
              timeframe: dbKey as '60m' | '1D' | '1W' | '1M',
              open: parseFloat(candle.open),
              high: parseFloat(candle.high),
              low: parseFloat(candle.low),
              close: parseFloat(candle.close),
              volume: parseInt(candle.volume || '0')
            }))
            .filter(candle => {
              // 円建てデータの整合性チェック（日本株は通常100円以上）
              const isValidJPYPrice = candle.close >= 50 && candle.close <= 100000;
              if (!isValidJPYPrice) {
                console.warn(`Invalid JPY price detected for ${symbol}: ${candle.close} at ${candle.timestamp}`);
              }
              return isValidJPYPrice;
            });
          
          this.db.insertStockData(stockData);
          console.log(`Stored ${stockData.length} ${dbKey} candles for ${symbol} (fetched as ${apiSymbol}:JPX)`);
          
          // プロプランでは遅延を短縮
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to fetch and store data for ${symbol}:`, error);
      return false;
    }
  }
  
  async updateAllTickers(tickers: string[]): Promise<void> {
    console.log(`Updating ${tickers.length} tickers from Twelve Data...`);
    
    // プロプランでは同時実行数を増やせる
    const batchSize = 50; // プロプランでは大幅に増やせる
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(ticker => this.fetchAndStoreStockData(ticker))
      );
      
      console.log(`Progress: ${Math.min(i + batchSize, tickers.length)}/${tickers.length}`);
      
      if (i + batchSize < tickers.length) {
        // プロプランでは短い遅延で十分
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('All tickers updated successfully');
  }
  
  close() {
    this.db.close();
  }
}