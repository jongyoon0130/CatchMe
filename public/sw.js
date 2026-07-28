// ---------------------------------------------------------------------------
// Future Me 서비스 워커 — 알림 수신기 (잠금 화면 푸시)
// ---------------------------------------------------------------------------

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function absoluteUrl(relative) {
  try {
    return new URL(relative || '/index.html', self.location.origin).href
  } catch {
    return self.location.origin + '/index.html'
  }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Future Me'
  const url = absoluteUrl(payload.url || '/index.html')
  const options = {
    body: payload.body || '다짐을 따라 쳐야 꺼져요',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'futureme-alarm',
    requireInteraction: true,
    silent: false,
    data: { url, alarm: payload.alarm || null },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = absoluteUrl(event.notification.data && event.notification.data.url)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.focus()
              return client.navigate(target)
            } catch {
              /* fall through */
            }
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
