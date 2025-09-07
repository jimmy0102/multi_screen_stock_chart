/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_CHART_BULLISH_COLOR: string
  readonly VITE_CHART_BULLISH_BORDER_COLOR: string
  readonly VITE_CHART_BULLISH_WICK_COLOR: string
  readonly VITE_CHART_BEARISH_COLOR: string
  readonly VITE_CHART_BEARISH_BORDER_COLOR: string
  readonly VITE_CHART_BEARISH_WICK_COLOR: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}