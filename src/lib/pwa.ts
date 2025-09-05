// PWA utilities and service worker registration

export interface PWAInstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

class PWAService {
  private installPromptEvent: PWAInstallPrompt | null = null
  private isInstalled = false
  private callbacks: ((canInstall: boolean, isInstalled: boolean) => void)[] = []

  constructor() {
    this.initializePWA()
  }

  private initializePWA() {
    // Register service worker
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('[PWA] SW registered: ', registration)
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New update available
                    this.showUpdateNotification()
                  }
                })
              }
            })
          })
          .catch((registrationError) => {
            console.log('[PWA] SW registration failed: ', registrationError)
          })
      })
    }

    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] Install prompt available')
      e.preventDefault()
      this.installPromptEvent = e as PWAInstallPrompt
      this.notifyCallbacks()
    })

    // Check if app is already installed
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App was installed')
      this.isInstalled = true
      this.installPromptEvent = null
      this.notifyCallbacks()
    })

    // Detect if app is running in standalone mode
    if (this.isRunningStandalone()) {
      this.isInstalled = true
      console.log('[PWA] App is running in standalone mode')
    }
  }

  private showUpdateNotification() {
    // Show update notification to user
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('アップデート利用可能', {
        body: '新しいバージョンが利用可能です。再起動してください。',
        icon: '/icons/icon-192x192.png',
        tag: 'update-available'
      })
    }
  }

  private isRunningStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://')
  }

  private notifyCallbacks() {
    const canInstall = !!this.installPromptEvent
    this.callbacks.forEach(callback => callback(canInstall, this.isInstalled))
  }

  // Subscribe to install state changes
  subscribe(callback: (canInstall: boolean, isInstalled: boolean) => void) {
    this.callbacks.push(callback)
    // Initial call
    callback(!!this.installPromptEvent, this.isInstalled)
    
    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) {
        this.callbacks.splice(index, 1)
      }
    }
  }

  // Trigger install prompt
  async installApp(): Promise<boolean> {
    if (!this.installPromptEvent) {
      console.log('[PWA] No install prompt available')
      return false
    }

    try {
      await this.installPromptEvent.prompt()
      const choiceResult = await this.installPromptEvent.userChoice
      
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt')
        this.installPromptEvent = null
        return true
      } else {
        console.log('[PWA] User dismissed install prompt')
        return false
      }
    } catch (error) {
      console.error('[PWA] Error showing install prompt:', error)
      return false
    }
  }

  // Request notification permission
  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('[PWA] Notifications not supported')
      return false
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission === 'denied') {
      return false
    }

    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  // Show local notification
  showNotification(title: string, options?: NotificationOptions) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge.png',
        ...options
      })
    }
  }

  // Enable background sync
  async enableBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in (window.ServiceWorkerRegistration.prototype as any)) {
      const registration = await navigator.serviceWorker.ready
      await (registration as any).sync.register('background-sync')
      console.log('[PWA] Background sync enabled')
      return true
    }
    return false
  }

  // Share content (Web Share API)
  async shareContent(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
    if ('share' in navigator) {
      try {
        await navigator.share(data)
        return true
      } catch (error) {
        console.log('[PWA] Share cancelled or failed:', error)
        return false
      }
    } else {
      // Fallback to clipboard
      if (data.url && (navigator as any).clipboard) {
        try {
          await (navigator as any).clipboard.writeText(data.url)
          this.showNotification('リンクをコピーしました')
          return true
        } catch (error) {
          console.log('[PWA] Clipboard write failed:', error)
        }
      }
      return false
    }
  }

  // Get device info for responsive design
  getDeviceInfo() {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const isTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches
    const isMobile = window.matchMedia('(max-width: 767px)').matches
    const isPortrait = window.matchMedia('(orientation: portrait)').matches
    
    return {
      isDesktop,
      isTablet,
      isMobile,
      isPortrait,
      isLandscape: !isPortrait,
      isStandalone: this.isRunningStandalone(),
      isInstalled: this.isInstalled
    }
  }

  // Store data offline
  async storeOfflineData(key: string, data: any) {
    if ('caches' in window) {
      try {
        const cache = await caches.open('offline-data')
        await cache.put(`/offline/${key}`, new Response(JSON.stringify(data)))
        console.log(`[PWA] Stored offline data: ${key}`)
      } catch (error) {
        console.error('[PWA] Failed to store offline data:', error)
      }
    }
  }

  // Retrieve offline data
  async getOfflineData(key: string): Promise<any> {
    if ('caches' in window) {
      try {
        const cache = await caches.open('offline-data')
        const response = await cache.match(`/offline/${key}`)
        if (response) {
          const data = await response.json()
          console.log(`[PWA] Retrieved offline data: ${key}`)
          return data
        }
      } catch (error) {
        console.error('[PWA] Failed to retrieve offline data:', error)
      }
    }
    return null
  }
}

// Singleton instance
export const pwaService = new PWAService()