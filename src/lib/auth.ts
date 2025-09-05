import { supabase } from './supabase'
import type { UserProfile } from './supabase'

export interface AuthState {
  user: UserProfile | null
  loading: boolean
  error: string | null
}

export class AuthService {
  private callbacks: ((state: AuthState) => void)[] = []
  private currentState: AuthState = {
    user: null,
    loading: true,
    error: null
  }

  constructor() {
    console.log('[Auth] AuthService constructor called')
    this.initializeAuth().catch(error => {
      console.error('[Auth] Failed to initialize:', error)
      this.updateState({
        user: null,
        loading: false,
        error: 'Failed to initialize authentication'
      })
    })
  }

  private async initializeAuth() {
    console.log('[Auth] Initializing authentication...')
    try {
      // 現在のセッションを確認
      console.log('[Auth] Getting session from Supabase...')
      const sessionResult = await supabase.auth.getSession()
      console.log('[Auth] Session result:', sessionResult)
      
      const { data: { session }, error: sessionError } = sessionResult
      
      if (sessionError) {
        console.error('[Auth] Session error:', sessionError)
        this.updateState({
          user: null,
          loading: false,
          error: null
        })
        return
      }
      
      console.log('[Auth] Session found:', !!session)
      
      if (session?.user) {
        console.log('[Auth] User found:', session.user.email)
        const profile = await this.fetchUserProfile(session.user.id)
        this.updateState({
          user: profile,
          loading: false,
          error: null
        })
      } else {
        console.log('[Auth] No active session')
        this.updateState({
          user: null,
          loading: false,
          error: null
        })
      }

      // 認証状態変更をリッスン
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] State change:', event, session?.user?.email)
        
        if (event === 'INITIAL_SESSION') {
          // Initial session is already handled above
          return
        }
        
        if (session?.user) {
          const profile = await this.fetchUserProfile(session.user.id)
          this.updateState({
            user: profile,
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
      })

    } catch (error) {
      console.error('[Auth] Initialization error:', error)
      this.updateState({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Authentication error'
      })
    }
  }

  private async fetchUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      console.log('[Auth] Fetching user profile for:', userId)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[Auth] Profile fetch error:', error)
        console.error('Error fetching user profile:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }

  private updateState(newState: Partial<AuthState>) {
    this.currentState = { ...this.currentState, ...newState }
    this.callbacks.forEach(callback => callback(this.currentState))
  }

  // 認証状態の購読
  subscribe(callback: (state: AuthState) => void) {
    this.callbacks.push(callback)
    // 初回実行
    callback(this.currentState)
    
    // 購読解除関数を返す
    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) {
        this.callbacks.splice(index, 1)
      }
    }
  }

  // 現在の状態を取得
  getState(): AuthState {
    return this.currentState
  }

  // ユーザー登録
  async signUp(email: string, password: string, fullName?: string) {
    try {
      this.updateState({ loading: true, error: null })

      console.log('[Auth] Attempting signup for:', email)

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || ''
          },
          emailRedirectTo: undefined // Disable email confirmation for now
        }
      })

      console.log('[Auth] Signup response:', { data, error })

      if (error) {
        console.error('[Auth] Signup error:', error)
        throw error
      }

      if (data.user && !data.session) {
        console.log('[Auth] User created but no session - email confirmation may be required')
        this.updateState({
          loading: false,
          error: 'Registration successful! Please check your email for confirmation.'
        })
        return { user: data.user, session: null }
      }

      console.log('[Auth] Signup successful')
      return { user: data.user, session: data.session }
    } catch (error) {
      console.error('[Auth] Signup failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed'
      this.updateState({ 
        loading: false, 
        error: `Registration failed: ${errorMessage}` 
      })
      throw error
    }
  }

  // ログイン
  async signIn(email: string, password: string) {
    try {
      this.updateState({ loading: true, error: null })

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw error
      }

      return { user: data.user, session: data.session }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed'
      this.updateState({ 
        loading: false, 
        error: errorMessage 
      })
      throw error
    }
  }

  // Google認証
  async signInWithGoogle() {
    try {
      this.updateState({ loading: true, error: null })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })

      if (error) {
        throw error
      }

      return data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign in failed'
      this.updateState({ 
        loading: false, 
        error: errorMessage 
      })
      throw error
    }
  }

  // ログアウト
  async signOut() {
    try {
      this.updateState({ loading: true, error: null })

      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      this.updateState({
        user: null,
        loading: false,
        error: null
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign out failed'
      this.updateState({ 
        loading: false, 
        error: errorMessage 
      })
      throw error
    }
  }

  // プロファイル更新
  async updateProfile(updates: Partial<UserProfile>) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      this.updateState({
        user: data,
        error: null
      })

      return data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed'
      this.updateState({ error: errorMessage })
      throw error
    }
  }

  // パスワード変更
  async updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        throw error
      }
    } catch (error) {
      throw error
    }
  }

  // パスワードリセット
  async resetPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) {
        throw error
      }
    } catch (error) {
      throw error
    }
  }

  // 認証チェック
  isAuthenticated(): boolean {
    return !!this.currentState.user
  }

  // 現在のユーザーを取得
  getCurrentUser(): UserProfile | null {
    return this.currentState.user
  }
}

// シングルトンインスタンス
export const authService = new AuthService()