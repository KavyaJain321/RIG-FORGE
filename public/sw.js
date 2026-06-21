/* Rig Forge service worker — minimal offline shell + Web Push notifications. */
const CACHE = 'rf-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

// Network-first for page navigations; fall back to the cached shell when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.mode !== 'navigate') return
  event.respondWith(fetch(req).catch(() => caches.match('/')))
})

// Push payload shape: { title, body, url }
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) { /* ignore */ }
  const title = data.title || 'Rig Forge'
  const options = {
    body: data.body || 'New message',
    icon: '/logo.svg',
    badge: '/logo.svg',
    data: { url: data.url || '/dashboard/messages' },
    tag: data.tag || undefined,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/messages'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
