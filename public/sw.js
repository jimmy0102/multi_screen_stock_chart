// Service Worker for Multi-Screen Stock Chart PWA
const CACHE_NAME = 'stock-chart-v1'
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
]

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Install event')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache')
        return cache.addAll(urlsToCache)
      })
  )
})

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return
  
  // Skip requests to APIs and external domains
  if (event.request.url.includes('api.') || 
      event.request.url.includes('supabase.co') ||
      event.request.url.includes('jquants.com')) {
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

// Background sync for offline data updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('[SW] Background sync triggered')
    event.waitUntil(doBackgroundSync())
  }
})

async function doBackgroundSync() {
  try {
    // Sync watchlist changes when back online
    const watchlistChanges = await getStoredWatchlistChanges()
    if (watchlistChanges.length > 0) {
      await syncWatchlistChanges(watchlistChanges)
    }

    // Sync notes when back online
    const noteChanges = await getStoredNoteChanges()
    if (noteChanges.length > 0) {
      await syncNoteChanges(noteChanges)
    }

    console.log('[SW] Background sync completed')
  } catch (error) {
    console.error('[SW] Background sync failed:', error)
  }
}

async function getStoredWatchlistChanges() {
  // Implementation would retrieve stored offline changes
  return []
}

async function syncWatchlistChanges(changes) {
  // Implementation would sync changes to Supabase
  console.log('[SW] Syncing watchlist changes:', changes.length)
}

async function getStoredNoteChanges() {
  // Implementation would retrieve stored offline changes
  return []
}

async function syncNoteChanges(changes) {
  // Implementation would sync changes to Supabase
  console.log('[SW] Syncing note changes:', changes.length)
}

// Push notifications for real-time updates
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    console.log('[SW] Push notification received:', data)

    const options = {
      body: data.body || 'New stock market update',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge.png',
      data: data.data || {},
      actions: [
        {
          action: 'view',
          title: '表示',
          icon: '/icons/view-action.png'
        },
        {
          action: 'dismiss',
          title: '閉じる',
          icon: '/icons/dismiss-action.png'
        }
      ]
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Stock Chart', options)
    )
  } catch (error) {
    console.error('[SW] Error processing push notification:', error)
  }
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action)
  
  event.notification.close()

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})

// Share target for Android sharing
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHARE_TARGET') {
    console.log('[SW] Share target data:', event.data.data)
    
    // Handle shared content (e.g., stock symbol)
    const sharedData = event.data.data
    if (sharedData.text) {
      // Store shared stock symbol for the app to pick up
      caches.open('shared-data').then(cache => {
        cache.put('/shared', new Response(JSON.stringify(sharedData)))
      })
    }
  }
})