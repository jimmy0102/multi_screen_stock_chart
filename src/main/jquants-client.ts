import axios from 'axios';
import { DatabaseManager } from './database';

interface JQuantsStock {
  Date: string;
  Code: string;
  CompanyName: string;
  CompanyNameEnglish: string;
  Sector17Code: string;
  Sector17CodeName: string;
  Sector33Code: string;
  Sector33CodeName: string;
  ScaleCategory: string;
  MarketCode: string;
  MarketCodeName: string;
  MarginCode?: string;
  MarginCodeName?: string;
}


interface JQuantsPriceData {
  Date: string;
  Code: string;
  Open: number | null;
  High: number | null;
  Low: number | null;
  Close: number | null;
  UpperLimit: string;
  LowerLimit: string;
  Volume: number | null;
  TurnoverValue: number | null;
  AdjustmentFactor: number;
  AdjustmentOpen: number | null;
  AdjustmentHigh: number | null;
  AdjustmentLow: number | null;
  AdjustmentClose: number | null;
  AdjustmentVolume: number | null;
}


export class JQuantsClient {
  private baseUrl = 'https://api.jquants.com/v1';
  private idToken: string | null = null;
  private email: string;
  private password: string;
  private lastRequestTime: number = 0;
  private rateLimitResetTime: number = 0;
  private readonly REQUEST_INTERVAL = 1200; // 1.2秒間隔（安全マージン込み）
  
  constructor() {
    this.email = process.env.JQUANTS_EMAIL || '';
    this.password = process.env.JQUANTS_PASSWORD || '';
  }
  
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // レート制限中の場合は待機
    if (this.rateLimitResetTime > now) {
      const waitTime = this.rateLimitResetTime - now;
      console.log(`Rate limit active. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitResetTime = 0;
    }
    
    // 前回のリクエストから最低限の間隔を確保
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.REQUEST_INTERVAL) {
      const waitTime = this.REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  private handleApiError(error: any): void {
    if (error.response?.data?.message?.includes('Rate limit')) {
      console.log('Rate limit detected. Setting cooldown period.');
      this.rateLimitResetTime = Date.now() + 5 * 60 * 1000;
    }
    
    if (error.response?.status === 401) {
      console.log('Authentication token expired, resetting token');
      this.idToken = null;
    }
  }

  private async authenticate(): Promise<boolean> {
    try {
      if (!this.email || !this.password) {
        console.log('J-Quants credentials not provided in .env file');
        return false;
      }

      console.log('Authenticating with J-Quants API...');
      
      // レート制限チェック
      await this.waitForRateLimit();
      
      // Step 1: Get refresh token
      const authResponse = await axios.post(`${this.baseUrl}/token/auth_user`, {
        mailaddress: this.email,
        password: this.password
      });

      const refreshToken = authResponse.data.refreshToken;
      if (!refreshToken) {
        console.error('Failed to get refresh token from J-Quants');
        return false;
      }

      // Step 2: Get ID token
      const tokenResponse = await axios.post(`${this.baseUrl}/token/auth_refresh?refreshtoken=${refreshToken}`);
      
      this.idToken = tokenResponse.data.idToken;
      if (!this.idToken) {
        console.error('Failed to get ID token from J-Quants');
        return false;
      }

      console.log('J-Quants authentication successful');
      return true;
    } catch (error: any) {
      console.error('J-Quants authentication failed:', error.response?.data || error.message);
      
      this.handleApiError(error);
      
      return false;
    }
  }

  async fetchListedInfo(): Promise<JQuantsStock[]> {
    try {
      console.log('Fetching listed stocks from J-Quants API...');
      
      // Authenticate if not already done
      if (!this.idToken) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          console.log('Authentication failed, using fallback data');
          return this.getFallbackTickers();
        }
      }

      const response = await axios.get(`${this.baseUrl}/listed/info`, {
        headers: {
          'Authorization': `Bearer ${this.idToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.data && response.data.info) {
        console.log(`Successfully fetched ${response.data.info.length} stocks from J-Quants`);
        return response.data.info;
      }
      
      return [];
    } catch (error: any) {
      console.error('Failed to fetch from J-Quants:', error.response?.data || error.message);
      return this.getFallbackTickers();
    }
  }
  
  private getFallbackTickers(): JQuantsStock[] {
    console.log('Using fallback ticker list from TSE website...');
    return [];
  }
  
  async updateTickerDatabase(db: DatabaseManager): Promise<boolean> {
    try {
      const stocks = await this.fetchListedInfo();
      
      if (stocks.length === 0) {
        console.log('No stocks fetched. Trying alternative source...');
        return await this.fetchFromTSEWebsite(db);
      }
      
      console.log(`Total stocks received from J-Quants: ${stocks.length}`);
      
      const primeStocks = stocks.filter(stock => 
        stock.MarketCodeName === 'プライム' || 
        stock.MarketCode === '0111'
      );
      
      console.log(`Found ${primeStocks.length} Prime market stocks`);
      
      // 普通株式のみをフィルタリング（末尾が0のものだけ）
      const commonStocks = primeStocks.filter(stock => 
        stock.Code.length === 5 && stock.Code.endsWith('0')
      );
      
      console.log(`Filtered to ${commonStocks.length} common stocks (ending with 0)`);
      
      const tickers = commonStocks.map(stock => ({
        // 5桁コードの末尾0を削除して4桁に変換
        symbol: stock.Code.slice(0, 4),
        name: stock.CompanyName,
        market: 'Prime'
      }));
      
      console.log(`Sample tickers:`, tickers.slice(0, 5).map(t => `${t.symbol}:${t.name}`));
      
      try {
        db.insertTickers(tickers);
        console.log(`Successfully updated ${tickers.length} tickers in database`);
      } catch (error) {
        console.error('Error inserting tickers:', error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to update ticker database:', error);
      return false;
    }
  }
  
  async fetchFromTSEWebsite(db: DatabaseManager): Promise<boolean> {
    try {
      console.log('Fetching ticker list from TSE website...');
      
      const response = await axios.get(
        'https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls',
        {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      if (!response.data) {
        throw new Error('No data received from TSE');
      }
      
      console.log('TSE data fetched, but parsing XLS requires additional handling');
      console.log('Using pre-defined ticker list instead...');
      
      return this.loadPredefinedTickers(db);
    } catch (error) {
      console.error('Failed to fetch from TSE website:', error);
      return this.loadPredefinedTickers(db);
    }
  }
  
  private async loadPredefinedTickers(db: DatabaseManager): Promise<boolean> {
    try {
      const { fetchTSEPrimeTickers } = await import('./ticker-fetcher');
      const tickers = await fetchTSEPrimeTickers();
      
      db.insertTickers(tickers);
      console.log(`Loaded ${tickers.length} predefined tickers`);
      
      return true;
    } catch (error) {
      console.error('Failed to load predefined tickers:', error);
      return false;
    }
  }

  async fetchDailyPrices(ticker: string, fromDate?: string, toDate?: string): Promise<JQuantsPriceData[]> {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        if (!this.idToken) {
          const authenticated = await this.authenticate();
          if (!authenticated) {
            console.error('Failed to authenticate with J-Quants API');
            return [];
          }
        }

        // レート制限チェック
        await this.waitForRateLimit();
        
        console.log(`Fetching data for ticker: ${ticker} (attempt ${retryCount + 1}/${maxRetries})`);

      let allData: JQuantsPriceData[] = [];
      let paginationKey: string | undefined = undefined;
      let pageCount = 0;
      
      do {
        const params: any = { code: ticker };
        if (fromDate) params.from = fromDate;
        if (toDate) params.to = toDate;
        if (paginationKey) params.pagination_key = paginationKey;
        
        console.log(`API Request params (page ${++pageCount}):`, params);

        const response = await axios.get(`${this.baseUrl}/prices/daily_quotes`, {
          headers: {
            'Authorization': `Bearer ${this.idToken}`
          },
          params
        });

        if (response.data && response.data.daily_quotes) {
          console.log(`API Response: received ${response.data.daily_quotes.length} records`);
          
          // 最初と最後のデータを確認
          if (response.data.daily_quotes.length > 0) {
            const first = response.data.daily_quotes[0];
            const last = response.data.daily_quotes[response.data.daily_quotes.length - 1];
            console.log(`  First record: ${first.Date}, Close: ${first.AdjustmentClose}`);
            console.log(`  Last record: ${last.Date}, Close: ${last.AdjustmentClose}`);
          }
          
          // Nullデータをフィルタリング
          const validData = response.data.daily_quotes.filter((d: JQuantsPriceData) => 
            d.AdjustmentOpen !== null && 
            d.AdjustmentClose !== null && 
            d.AdjustmentHigh !== null && 
            d.AdjustmentLow !== null
          );
          console.log(`  Valid records after filtering: ${validData.length}`);
          
          allData = allData.concat(validData);
          paginationKey = response.data.pagination_key;
        } else {
          console.log('No data in response');
          break;
        }
      } while (paginationKey);
      
      console.log(`Total records fetched for ${ticker}: ${allData.length}`);

        return allData;
      } catch (error: any) {
        console.error(`Failed to fetch daily prices for ${ticker} (attempt ${retryCount + 1}):`, error.response?.data || error.message);
        
        this.handleApiError(error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          if (error.response?.data?.message?.includes('Rate limit')) {
            const backoffTime = Math.pow(2, retryCount) * 60000;
            console.log(`Rate limit hit. Retrying in ${backoffTime / 60000} minutes...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          } else if (error.response?.status === 401) {
            console.log('Authentication expired. Retrying with new token...');
          }
          continue;
        }
        
        return [];
      }
    }
    
    return [];
  }

  private convertToWeeklyData(dailyData: JQuantsPriceData[]): any[] {
    const weeklyData: any[] = [];
    if (dailyData.length === 0) return weeklyData;

    // 日付でソート
    const sortedData = [...dailyData].sort((a, b) => a.Date.localeCompare(b.Date));
    
    let weekStart = 0;
    for (let i = 0; i < sortedData.length; i++) {
      const currentDate = new Date(sortedData[i].Date);
      const nextDate = i < sortedData.length - 1 ? new Date(sortedData[i + 1].Date) : null;
      
      // 週の最後か最後のデータの場合
      if (!nextDate || currentDate.getDay() === 5 || nextDate.getDay() < currentDate.getDay()) {
        const weekData = sortedData.slice(weekStart, i + 1);
        weeklyData.push({
          Date: weekData[weekData.length - 1].Date,
          Code: weekData[0].Code,
          Open: weekData[0].AdjustmentOpen || 0,
          High: Math.max(...weekData.map(d => d.AdjustmentHigh || 0)),
          Low: Math.min(...weekData.filter(d => d.AdjustmentLow).map(d => d.AdjustmentLow || 0)),
          Close: weekData[weekData.length - 1].AdjustmentClose || 0,
          Volume: weekData.reduce((sum, d) => sum + (d.AdjustmentVolume || 0), 0)
        });
        weekStart = i + 1;
      }
    }
    
    return weeklyData;
  }

  private convertToMonthlyData(dailyData: JQuantsPriceData[]): any[] {
    const monthlyData: any[] = [];
    if (dailyData.length === 0) return monthlyData;

    // 日付でソート
    const sortedData = [...dailyData].sort((a, b) => a.Date.localeCompare(b.Date));
    
    let monthStart = 0;
    for (let i = 0; i < sortedData.length; i++) {
      const currentDate = new Date(sortedData[i].Date);
      const nextDate = i < sortedData.length - 1 ? new Date(sortedData[i + 1].Date) : null;
      
      // 月の最後か最後のデータの場合
      if (!nextDate || nextDate.getMonth() !== currentDate.getMonth() || nextDate.getFullYear() !== currentDate.getFullYear()) {
        const monthData = sortedData.slice(monthStart, i + 1);
        monthlyData.push({
          Date: monthData[monthData.length - 1].Date,
          Code: monthData[0].Code,
          Open: monthData[0].AdjustmentOpen || 0,
          High: Math.max(...monthData.map(d => d.AdjustmentHigh || 0)),
          Low: Math.min(...monthData.filter(d => d.AdjustmentLow).map(d => d.AdjustmentLow || 0)),
          Close: monthData[monthData.length - 1].AdjustmentClose || 0,
          Volume: monthData.reduce((sum, d) => sum + (d.AdjustmentVolume || 0), 0)
        });
        monthStart = i + 1;
      }
    }
    
    return monthlyData;
  }

  async fetchAndStoreStockData(ticker: string, db: DatabaseManager): Promise<boolean> {
    try {
      console.log(`Fetching stock data for ${ticker} from J-Quants...`);
      
      // ライトプランで過去5年分のデータを取得
      // toDateは明日の日付を設定（APIが前営業日までのデータを返すため）
      const toDate = new Date();
      toDate.setDate(toDate.getDate() + 1);
      const fromDate = new Date();
      fromDate.setFullYear(toDate.getFullYear() - 5);
      
      console.log(`Requesting data from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
      
      const dailyData = await this.fetchDailyPrices(
        ticker,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0]
      );

      if (dailyData.length === 0) {
        console.error(`No data found for ${ticker}`);
        return false;
      }
      
      // 取得したデータの日付範囲を確認
      const sortedDaily = [...dailyData].sort((a, b) => a.Date.localeCompare(b.Date));
      console.log(`Received ${dailyData.length} data points for ${ticker}`);
      if (sortedDaily.length > 0) {
        console.log(`Date range: ${sortedDaily[0].Date} to ${sortedDaily[sortedDaily.length - 1].Date}`);
        console.log(`Latest data: Date=${sortedDaily[sortedDaily.length - 1].Date}, Close=${sortedDaily[sortedDaily.length - 1].AdjustmentClose}`);
      }

      // 日足データを保存（Nullチェック付き）
      const dailyStockData = dailyData
        .filter(candle => 
          candle.AdjustmentOpen !== null &&
          candle.AdjustmentHigh !== null &&
          candle.AdjustmentLow !== null &&
          candle.AdjustmentClose !== null
        )
        .map(candle => ({
          ticker: ticker,
          timestamp: candle.Date,
          timeframe: '1D' as '60m' | '1D' | '1W' | '1M',
          open: candle.AdjustmentOpen || 0,
          high: candle.AdjustmentHigh || 0,
          low: candle.AdjustmentLow || 0,
          close: candle.AdjustmentClose || 0,
          volume: candle.AdjustmentVolume || 0
        }));
      // 既存データをクリアしてから新規データを挿入
      db.clearStockData(ticker, '1D');
      db.insertStockData(dailyStockData);
      console.log(`Stored ${dailyStockData.length} daily candles for ${ticker}`);

      // 週足データを生成して保存
      const weeklyData = this.convertToWeeklyData(dailyData);
      const weeklyStockData = weeklyData.map(candle => ({
        ticker: ticker,
        timestamp: candle.Date,
        timeframe: '1W' as '60m' | '1D' | '1W' | '1M',
        open: candle.Open,
        high: candle.High,
        low: candle.Low,
        close: candle.Close,
        volume: candle.Volume
      }));
      // 既存データをクリアしてから新規データを挿入
      db.clearStockData(ticker, '1W');
      db.insertStockData(weeklyStockData);
      console.log(`Stored ${weeklyStockData.length} weekly candles for ${ticker}`);

      // 月足データを生成して保存
      const monthlyData = this.convertToMonthlyData(dailyData);
      const monthlyStockData = monthlyData.map(candle => ({
        ticker: ticker,
        timestamp: candle.Date,
        timeframe: '1M' as '60m' | '1D' | '1W' | '1M',
        open: candle.Open,
        high: candle.High,
        low: candle.Low,
        close: candle.Close,
        volume: candle.Volume
      }));
      // 既存データをクリアしてから新規データを挿入
      db.clearStockData(ticker, '1M');
      db.insertStockData(monthlyStockData);
      console.log(`Stored ${monthlyStockData.length} monthly candles for ${ticker}`);

      return true;
    } catch (error) {
      console.error(`Failed to fetch and store data for ${ticker}:`, error);
      return false;
    }
  }

  close() {
    // クリーンアップが必要な場合はここで実行
    console.log('J-Quants client closed');
  }
  
  // レート制限状態の取得
  getRateLimitStatus(): { isLimited: boolean, resetTime: number } {
    return {
      isLimited: this.rateLimitResetTime > Date.now(),
      resetTime: this.rateLimitResetTime
    };
  }
}