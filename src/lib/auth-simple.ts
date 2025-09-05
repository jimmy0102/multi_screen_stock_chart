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

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}

export const simpleAuthService = new SimpleAuthService()