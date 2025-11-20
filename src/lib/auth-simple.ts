import { supabase } from './supabase'
import type { UserProfile } from './supabase'

export interface AuthState {
  user: UserProfile | null
  loading: boolean
  error: string | null
}

class SimpleAuthService {
  private callbacks: ((state: AuthState) => void)[] = []
  private currentState: AuthState = {
    user: null,
    loading: true,
    error: null
  }
  private initialized = false

  async initialize() {
    if (this.initialized) return
    this.initialized = true
    
    console.log('[SimpleAuth] Starting initialization...')
    
    // Electronアプリの場合、OAuth コールバックを監視
    if (window.navigator.userAgent.includes('Electron') && window.electronAPI?.onOAuthCallback) {
      window.electronAPI.onOAuthCallback((url: string) => {
        console.log('[SimpleAuth] OAuth callback received:', url)
        this.handleOAuthCallback(url)
      })
    }
    
    try {
      console.log('[SimpleAuth] Calling supabase.auth.getSession()...')
      const startTime = Date.now()
      
      // タイムアウトを設定
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Session fetch timeout')), 3000)
      })
      
      const sessionPromise = supabase.auth.getSession()
      
      const result = await Promise.race([sessionPromise, timeoutPromise]) as any
      const elapsed = Date.now() - startTime
      
      console.log(`[SimpleAuth] getSession completed in ${elapsed}ms`)
      
      const { data: { session }, error } = result
      console.log('[SimpleAuth] Session result:', { hasSession: !!session, error })
      
      if (session?.user) {
        // Try to get user profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        this.updateState({
          user: profile || { 
            id: session.user.id, 
            email: session.user.email || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          loading: false,
          error: null
        })
      } else {
        this.updateState({
          user: null,
          loading: false,
          error: null
        })
      }
    } catch (error) {
      console.error('[SimpleAuth] Initialization error:', error)
      
      // タイムアウトエラーの場合は認証なしで続行
      if (error instanceof Error && error.message === 'Session fetch timeout') {
        console.log('[SimpleAuth] Session fetch timed out, proceeding without authentication')
        this.updateState({
          user: null,
          loading: false,
          error: null
        })
      } else {
        this.updateState({
          user: null,
          loading: false,
          error: 'Failed to initialize authentication'
        })
      }
    }
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[SimpleAuth] Auth state changed:', event, { hasSession: !!session, userEmail: session?.user?.email })
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('[SimpleAuth] Processing SIGNED_IN event...')
        
        // Supabase接続が不安定なため、プロフィール取得をスキップして基本情報で継続
        const basicUserProfile = { 
          id: session.user.id, 
          email: session.user.email || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        console.log('[SimpleAuth] Using basic user profile:', basicUserProfile)
        
        this.updateState({
          user: basicUserProfile,
          loading: false,
          error: null
        })
        
        console.log('[SimpleAuth] SIGNED_IN processing complete')
        
        // バックグラウンドでプロフィール取得を試行（失敗しても無視）
        setTimeout(async () => {
          try {
            console.log('[SimpleAuth] Attempting background profile fetch...')
            const { data: profile } = await Promise.race([
              supabase.from('user_profiles').select('*').eq('id', session.user.id).single(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 2000))
            ]) as any
            
            if (profile) {
              console.log('[SimpleAuth] Background profile fetch successful')
              this.updateState({
                user: profile,
                loading: false,
                error: null
              })
            }
          } catch (error) {
            console.log('[SimpleAuth] Background profile fetch failed, continuing with basic profile')
          }
        }, 100)
      } else if (event === 'SIGNED_OUT') {
        console.log('[SimpleAuth] Processing SIGNED_OUT event...')
        this.updateState({
          user: null,
          loading: false,
          error: null
        })
      }
    })
  }

  private updateState(newState: Partial<AuthState>) {
    this.currentState = { ...this.currentState, ...newState }
    this.callbacks.forEach(cb => cb(this.currentState))
  }

  subscribe(callback: (state: AuthState) => void) {
    this.callbacks.push(callback)
    callback(this.currentState)
    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) {
        this.callbacks.splice(index, 1)
      }
    }
  }

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) throw error
    return data
  }

  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })
    
    if (error) throw error
    return data
  }

  async signInWithGoogle() {
    // Electronアプリかどうかを判定（複数の方法で確認）
    const isElectron = (
      window.navigator.userAgent.includes('Electron') ||
      (window as any).electronAPI ||
      (window as any).require ||
      window.location.protocol === 'file:'
    )
    console.log('[SimpleAuth] signInWithGoogle - isElectron:', isElectron)
    console.log('[SimpleAuth] User agent:', window.navigator.userAgent)
    console.log('[SimpleAuth] Location:', window.location.href)
    
    if (isElectron) {
      console.log('[SimpleAuth] Electron environment detected - using external browser flow')
      
      // Electronの場合は手動でOAuth URLを取得して外部ブラウザで開く
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // 外部ブラウザでの認証完了後、ユーザーが手動でアプリに戻る
          redirectTo: 'https://yuzgwwnecgvulsrqbxng.supabase.co/auth/v1/callback',
          skipBrowserRedirect: true
        }
      })
      
      if (error) {
        console.error('[SimpleAuth] OAuth URL generation error:', error)
        throw error
      }
      
      // OAuth URLをログ出力
      console.log('[SimpleAuth] OAuth URL generated:', data.url)
      
      if (data.url) {
        // 外部ブラウザでOAuth URLを開く
        console.log('[SimpleAuth] Opening OAuth URL in external browser...')
        
        // 外部ブラウザでOAuth URLを開く
        // Windowsでも確実に動作するようwindow.openを使用
        window.open(data.url, '_blank')
        
        // セッション確認を開始（即座に開始）
        this.startElectronAuthPolling()
      } else {
        throw new Error('OAuth URL not generated')
      }
      
      return data
    } else {
      console.log('[SimpleAuth] Browser environment detected - using standard flow')
      
      // ブラウザの場合は通常のフロー
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`
        }
      })
      
      if (error) throw error
      return data
    }
  }

  private startElectronAuthPolling() {
    console.log('[SimpleAuth] Starting Electron auth polling...')
    
    let pollCount = 0
    const maxPolls = 90 // 最大90回（3分間、2秒間隔）
    
    const pollInterval = setInterval(async () => {
      pollCount++
      console.log(`[SimpleAuth] Polling session... (${pollCount}/${maxPolls})`)
      
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session && session.user) {
          console.log('[SimpleAuth] Session found during polling!', session.user.email)
          clearInterval(pollInterval)
          
          // 認証成功をトリガー
          this.updateState({
            user: { 
              id: session.user.id, 
              email: session.user.email || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            loading: false,
            error: null
          })
          return
        }
        
        if (pollCount >= maxPolls) {
          console.log('[SimpleAuth] Polling timeout reached')
          clearInterval(pollInterval)
          this.updateState({
            user: null,
            loading: false,
            error: 'Google認証がタイムアウトしました。再度お試しください。'
          })
        }
      } catch (error) {
        console.error('[SimpleAuth] Error during polling:', error)
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          this.updateState({
            user: null,
            loading: false,
            error: 'Google認証の確認に失敗しました。'
          })
        }
      }
    }, 2000) // 2秒ごとにチェック（より早く認証を検知）
  }

  private async handleOAuthCallback(url: string) {
    console.log('[SimpleAuth] Processing OAuth callback:', url)
    
    try {
      const urlObj = new URL(url)
      const fragment = urlObj.hash
      
      if (fragment) {
        console.log('[SimpleAuth] Fragment found:', fragment)
        
        // フラグメントからトークン情報を手動で抽出
        const params = new URLSearchParams(fragment.slice(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        
        if (accessToken && refreshToken) {
          console.log('[SimpleAuth] Tokens found, setting session...')
          
          // Supabaseにセッションを設定
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            console.error('[SimpleAuth] Error setting session:', error)
            throw error
          }
          
          if (data.session && data.session.user) {
            console.log('[SimpleAuth] OAuth callback successful:', data.session.user.email)
            this.updateState({
              user: { 
                id: data.session.user.id, 
                email: data.session.user.email || '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              loading: false,
              error: null
            })
            return
          }
        }
      }
      
      // トークンが見つからない場合やセッション設定に失敗した場合はポーリングにフォールバック
      console.log('[SimpleAuth] No tokens found or session setup failed, starting polling...')
      this.startElectronAuthPolling()
      
    } catch (error) {
      console.error('[SimpleAuth] Error processing OAuth callback:', error)
      
      // エラーの場合もポーリングを試行
      console.log('[SimpleAuth] Fallback to polling...')
      this.startElectronAuthPolling()
    }
  }

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}

export const simpleAuthService = new SimpleAuthService()