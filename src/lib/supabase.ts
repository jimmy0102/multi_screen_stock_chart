import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

console.log('[Supabase] Initializing with:', {
  url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING',
  key: supabaseAnonKey ? 'SET' : 'MISSING'
})

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing credentials!')
  throw new Error('Supabase URL and anon key are required')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database Types
export interface StockPrice {
  id: string
  ticker: string
  date: string
  timeframe: '1D' | '1W' | '1M' | '4H' | '1H'
  open: number
  high: number
  low: number
  close: number
  volume: number
  created_at: string
  updated_at: string
}

export interface TickerMaster {
  id: string
  symbol: string
  name: string
  market: string
  sector?: string
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Watchlist {
  id: string
  user_id: string
  ticker: string
  name?: string
  created_at: string
}

export interface ChartDrawing {
  id: string
  user_id: string
  ticker: string
  timeframe: '1D' | '1W' | '1M' | '4H' | '1H'
  type: 'horizontal_line' | 'trend_line' | 'rectangle' | 'text'
  data: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  ticker: string
  text: string
  created_at: string
  updated_at: string
}