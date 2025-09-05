import axios from 'axios';
import { DatabaseManager } from './database';

interface JQuantsStock {
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
}

interface JQuantsAuthResponse {
  refreshToken: string;
}

interface JQuantsTokenResponse {
  idToken: string;
}

interface JQuantsPriceData {
  Date: string;
  Code: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  TurnoverValue: number;
  AdjustmentFactor: number;
  AdjustmentOpen: number;
  AdjustmentHigh: number;
  AdjustmentLow: number;
  AdjustmentClose: number;
  AdjustmentVolume: number;
}

export class JQuantsClient {
  private baseUrl = 'https://api.jquants.com/v1';
  private idToken: string | null = null;
  private email: string;
  private password: string;
  
  constructor() {
    this.email = process.env.JQUANTS_EMAIL || '';
    this.password = process.env.JQUANTS_PASSWORD || '';
  }
  
  private async authenticate(): Promise<boolean> {
    try {
      if (!this.email || !this.password) {
        console.log('J-Quants credentials not provided in .env file');
        return false;
      }

      console.log('Authenticating with J-Quants API...');
      
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
      
      const primeStocks = stocks.filter(stock => 
        stock.MarketCodeName === 'プライム' || 
        stock.MarketCode === '0111'
      );
      
      console.log(`Found ${primeStocks.length} Prime market stocks`);
      
      const tickers = primeStocks.map(stock => ({
        symbol: stock.Code,
        name: stock.CompanyName,
        market: 'Prime'
      }));
      
      db.insertTickers(tickers);
      console.log(`Successfully updated ${tickers.length} tickers in database`);
      
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
    try {
      if (!this.idToken) {
        const authenticated = await this.authenticate();
        if (!authenticated) {
          console.error('Failed to authenticate with J-Quants API');
          return [];
        }
      }

      const params: any = { code: ticker };
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const response = await axios.get(`${this.baseUrl}/prices/daily_quotes`, {
        headers: {
          'Authorization': `Bearer ${this.idToken}`
        },
        params
      });

      if (response.data && response.data.daily_quotes) {
        return response.data.daily_quotes;
      }

      return [];
    } catch (error: any) {
      console.error(`Failed to fetch daily prices for ${ticker}:`, error.response?.data || error.message);
      return [];
    }
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
          Open: weekData[0].AdjustmentOpen,
          High: Math.max(...weekData.map(d => d.AdjustmentHigh)),
          Low: Math.min(...weekData.map(d => d.AdjustmentLow)),
          Close: weekData[weekData.length - 1].AdjustmentClose,
          Volume: weekData.reduce((sum, d) => sum + d.AdjustmentVolume, 0)
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
          Open: monthData[0].AdjustmentOpen,
          High: Math.max(...monthData.map(d => d.AdjustmentHigh)),
          Low: Math.min(...monthData.map(d => d.AdjustmentLow)),
          Close: monthData[monthData.length - 1].AdjustmentClose,
          Volume: monthData.reduce((sum, d) => sum + d.AdjustmentVolume, 0)
        });
        monthStart = i + 1;
      }
    }
    
    return monthlyData;
  }

  async fetchAndStoreStockData(ticker: string, db: DatabaseManager): Promise<boolean> {
    try {
      console.log(`Fetching stock data for ${ticker} from J-Quants...`);
      
      // 過去3年分のデータを取得
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setFullYear(toDate.getFullYear() - 3);
      
      const dailyData = await this.fetchDailyPrices(
        ticker,
        fromDate.toISOString().split('T')[0],
        toDate.toISOString().split('T')[0]
      );

      if (dailyData.length === 0) {
        console.error(`No data found for ${ticker}`);
        return false;
      }

      // 日足データを保存
      const dailyStockData = dailyData.map(candle => ({
        ticker: ticker,
        timestamp: candle.Date,
        timeframe: '1D' as '60m' | '1D' | '1W' | '1M',
        open: candle.AdjustmentOpen,
        high: candle.AdjustmentHigh,
        low: candle.AdjustmentLow,
        close: candle.AdjustmentClose,
        volume: candle.AdjustmentVolume
      }));
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
  }
}