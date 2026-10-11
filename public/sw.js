const CACHE_NAME = 'tokyo-travel-v1'
const APP_SHELL = ['/','/index.html','/manifest.webmanifest','/icon.svg','/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.url.startsWith('chrome-extension://')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          const responseToCache = response.clone()
          if (response.ok && event.request.url.startsWith(self.location.origin)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache))
          }
          return response
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return caches.match('/icon.svg')
        })
    }),
  )
})
