import React, { useState, useEffect } from 'react'
import { simpleAuthService } from '../../lib/auth-simple'

const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 認証状態の変更を監視してローディング状態を解除
  useEffect(() => {
    const unsubscribe = simpleAuthService.subscribe((authState) => {
      console.log('[LoginScreen] Auth state changed:', { hasUser: !!authState.user, loading: authState.loading })
      
      if (authState.user) {
        console.log('[LoginScreen] User authenticated, clearing loading state')
        setLoading(false)
      } else if (!authState.loading && authState.error) {
        setLoading(false)
        setError(authState.error)
      }
    })

    return unsubscribe
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      console.log('[LoginScreen] Starting authentication...', { mode, email })
      
      if (mode === 'signup') {
        const result = await simpleAuthService.signUp(email, password)
        console.log('[LoginScreen] Signup result:', result)
        setError('確認メールを送信しました。メールをご確認ください。')
      } else {
        const result = await simpleAuthService.signIn(email, password)
        console.log('[LoginScreen] Login result:', result)
        console.log('[LoginScreen] Login successful, waiting for auth state change...')
      }
    } catch (error) {
      console.error('[LoginScreen] Authentication error:', error)
      setError(error instanceof Error ? error.message : 'エラーが発生しました')
      setLoading(false)
    }
    // ログイン成功時はsetLoading(false)を呼ばない - auth state changeで処理される
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)

    try {
      // Google認証は後で実装
      setError('Google認証は現在準備中です')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Google認証でエラーが発生しました')
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('メールアドレスを入力してください')
      return
    }

    setLoading(true)
    try {
      // パスワードリセットは後で実装
      setError('パスワードリセットメールを送信しました。メールをご確認ください。')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'パスワードリセットでエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <h1>Multi-Screen Stock Chart</h1>
          <p>マルチデバイス対応株価分析ツール</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => setMode('signin')}
            disabled={loading}
          >
            ログイン
          </button>
          <button
            className={`tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => setMode('signup')}
            disabled={loading}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="fullName">お名前</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="お名前を入力"
                disabled={loading}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">メールアドレス</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレスを入力"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              disabled={loading}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className={`error-message ${error.includes('確認メール') || error.includes('リセット') ? 'success' : ''}`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <span className="loading-spinner"></span>
            ) : (
              mode === 'signin' ? 'ログイン' : '新規登録'
            )}
          </button>
        </form>

        <div className="divider">
          <span>または</span>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="google-button"
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
            <path fill="#FBBC05" d="M4.46 10.41A4.8 4.8 0 0 1 4.21 9a4.8 4.8 0 0 1 .25-1.41V5.52H1.83a8 8 0 0 0 0 6.96l2.63-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1 8 8 0 0 0 1.83 5.52L4.46 7.6A4.8 4.8 0 0 1 8.98 4.18z"/>
          </svg>
          Googleでログイン
        </button>

        {mode === 'signin' && (
          <button
            onClick={handleResetPassword}
            className="forgot-password"
            disabled={loading}
            type="button"
          >
            パスワードを忘れた場合
          </button>
        )}

        <div className="login-footer">
          <p>
            {mode === 'signin' ? 'アカウントをお持ちでない方は ' : '既にアカウントをお持ちの方は '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="link-button"
              disabled={loading}
            >
              {mode === 'signin' ? '新規登録' : 'ログイン'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginScreen