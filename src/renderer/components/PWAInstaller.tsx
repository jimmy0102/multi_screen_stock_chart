import React, { useState, useEffect } from 'react'
import { pwaService } from '../../lib/pwa'

const PWAInstaller: React.FC = () => {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const unsubscribe = pwaService.subscribe((canInstall, isInstalled) => {
      setCanInstall(canInstall)
      setIsInstalled(isInstalled)
      
      // Show install banner after a delay
      if (canInstall && !isInstalled) {
        const timer = setTimeout(() => setShowBanner(true), 3000)
        return () => clearTimeout(timer)
      }
    })

    return unsubscribe
  }, [])

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      const installed = await pwaService.installApp()
      if (installed) {
        setShowBanner(false)
        // Show success notification
        pwaService.showNotification('アプリがインストールされました！', {
          body: 'ホーム画面からアクセスできます'
        })
      }
    } catch (error) {
      console.error('Install failed:', error)
    } finally {
      setIsInstalling(false)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    // Don't show again for this session
    sessionStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Don't show if already dismissed this session
  if (sessionStorage.getItem('pwa-install-dismissed')) {
    return null
  }

  // Only show if can install and not already installed
  if (!canInstall || isInstalled || !showBanner) {
    return null
  }

  return (
    <div className="pwa-install-banner">
      <div className="pwa-install-content">
        <div className="pwa-install-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </div>
        
        <div className="pwa-install-text">
          <h3>アプリをインストール</h3>
          <p>ホーム画面に追加してより便利に利用できます</p>
        </div>

        <div className="pwa-install-actions">
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="pwa-install-button"
          >
            {isInstalling ? (
              <span className="loading-spinner small"></span>
            ) : (
              'インストール'
            )}
          </button>
          
          <button
            onClick={handleDismiss}
            className="pwa-dismiss-button"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

export default PWAInstaller