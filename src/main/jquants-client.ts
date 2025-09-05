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
}