// ---------------------------------------------------------------------------
// Future Me 서비스 워커 — 푸시 수신 + 백그라운드 알람 예약
// (메인 앱 JS는 iOS 백그라운드에서 멈추므로, 알람은 SW에서 울린다)
// ---------------------------------------------------------------------------

const SW_ALARM_DB = 'futureme-sw-alarms'
const SW_ALARM_STORE = 'fired'
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      await rescheduleFromStorage()
    })(),
  )
})

function absoluteUrl(relative) {
  try {
    return new URL(relative || '/index.html', self.location.origin).href
  } catch {
    return self.location.origin + '/index.html'
  }
}

function dateKeyFrom(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function alarmActiveOnDate(alarm, date) {
  if (!alarm.enabled) return false
  const days = alarm.repeatDays?.length ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6]
  return days.includes(date.getDay())
}

function dedupKey(dateKey, alarmId, time) {
  return `clock:${dateKey}:${alarmId}:${time}`
}

function openAlarmDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_ALARM_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SW_ALARM_STORE)) {
        db.createObjectStore(SW_ALARM_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadFiredKeys() {
  const db = await openAlarmDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SW_ALARM_STORE, 'readonly')
    const store = tx.objectStore(SW_ALARM_STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const keys = new Set((req.result || []).map((row) => row.key))
      resolve(keys)
    }
    req.onerror = () => reject(req.error)
  })
}

async function markFired(key) {
  const db = await openAlarmDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SW_ALARM_STORE, 'readwrite')
    tx.objectStore(SW_ALARM_STORE).put({ key, at: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function pruneFiredKeys(todayKey) {
  const db = await openAlarmDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SW_ALARM_STORE, 'readwrite')
    const store = tx.objectStore(SW_ALARM_STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      for (const row of req.result || []) {
        const dateKey = row.key.split(':')[1]
        if (dateKey && dateKey < todayKey) store.delete(row.key)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function findNextFire(alarm, now, fired) {
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    if (!alarmActiveOnDate(alarm, day)) continue
    const [hour, minute] = alarm.time.split(':').map(Number)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue
    const at = new Date(day)
    at.setHours(hour, minute, 0, 0)
    const dk = dateKeyFrom(day)
    const dedup = dedupKey(dk, alarm.id, alarm.time)
    if (fired.has(dedup)) continue
    if (at.getTime() <= now.getTime()) continue
    return {
      alarmId: alarm.id,
      label: alarm.label || '알람',
      time: alarm.time,
      dateKey: dk,
      dedup,
      fireAt: at.getTime(),
    }
  }
  return null
}

function clearPendingTimers() {
  for (const timer of pendingTimers.values()) clearTimeout(timer)
  pendingTimers.clear()
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) client.postMessage(message)
}

async function fireScheduledAlarm(payload, phrase) {
  if (await isAlreadyFired(payload.dedup)) return

  await markFired(payload.dedup)

  const params = new URLSearchParams({
    alarm: '1',
    alarmId: payload.alarmId,
    dateKey: payload.dateKey,
    time: payload.time,
    label: payload.label,
    phrase: phrase || '안녕',
  })
  const url = absoluteUrl(`/index.html?${params.toString()}`)

  await self.registration.showNotification(payload.label, {
    body: '다짐을 따라 쳐야 꺼져요 — Future Me',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.dedup,
    requireInteraction: true,
    silent: false,
    data: {
      url,
      alarm: {
        alarmId: payload.alarmId,
        dateKey: payload.dateKey,
        time: payload.time,
        label: payload.label,
        phrase: phrase || '안녕',
      },
    },
  })

  await notifyClients({
    type: 'alarm-sw-fired',
    dedup: payload.dedup,
    dateKey: payload.dateKey,
    alarmId: payload.alarmId,
    time: payload.time,
    label: payload.label,
    phrase: phrase || '안녕',
  })
}

async function isAlreadyFired(key) {
  const fired = await loadFiredKeys()
  return fired.has(key)
}

async function scheduleOne(alarm, phrase, fired, now = new Date()) {
  const next = findNextFire(alarm, now, fired)
  if (!next) return

  const delay = next.fireAt - now.getTime()
  if (delay <= 0 || delay > 86_400_000) return

  if (pendingTimers.has(next.dedup)) return

  // 이 알람에 밤에 적어둔 다짐이 있으면 그게 해제 문구다. 없으면 전역 폴백.
  const alarmPhrase =
    typeof alarm.resolve === 'string' && alarm.resolve.trim() ? alarm.resolve.trim() : phrase

  const timer = setTimeout(() => {
    pendingTimers.delete(next.dedup)
    eventWait(fireScheduledAlarm(next, alarmPhrase))
  }, delay)

  pendingTimers.set(next.dedup, timer)
}

function eventWait(promise) {
  // keepalive for older SW runtimes
  if (promise && typeof promise.then === 'function') {
    promise.catch((err) => console.error('[FutureMe/sw] alarm fire failed', err))
  }
}

/** @type {{ alarms: object[], phrase: string, settings: { enabled?: boolean } } | null} */
let lastSyncPayload = null

async function syncAlarmsFromMessage(data) {
  lastSyncPayload = data
  clearPendingTimers()

  const settings = data.settings || { enabled: true }
  if (settings.enabled === false) return

  const alarms = Array.isArray(data.alarms) ? data.alarms.filter((a) => a?.enabled !== false) : []
  if (!alarms.length) return

  const phrase = data.phrase || '안녕'
  const now = new Date()
  const todayKey = dateKeyFrom(now)
  await pruneFiredKeys(todayKey)
  const fired = await loadFiredKeys()

  for (const alarm of alarms) {
    await scheduleOne(alarm, phrase, fired, now)
  }
}

async function rescheduleFromStorage() {
  if (lastSyncPayload) await syncAlarmsFromMessage(lastSyncPayload)
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'sync-alarms') {
    eventWait(syncAlarmsFromMessage(data))
    return
  }

  if (data.type === 'mark-alarm-fired' && data.dedup) {
    eventWait(markFired(data.dedup))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  let hadData = false
  if (event.data) {
    hadData = true
    try {
      payload = event.data.json()
    } catch {
      try {
        payload = JSON.parse(event.data.text())
      } catch {
        payload = { body: event.data.text() }
      }
    }
  }

  const title = payload.title || 'Future Me'
  const url = absoluteUrl(payload.url || '/index.html')
  const options = {
    body: payload.body || (hadData ? '다짐을 따라 쳐야 꺼져요' : '알림 내용을 불러오지 못했어'),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'futureme-alarm',
    requireInteraction: true,
    silent: false,
    data: { url, alarm: payload.alarm || null },
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      const tag = payload.tag || ''
      const alarm = payload.alarm || null
      if (tag.startsWith('clock:') && alarm?.dateKey) {
        await markFired(tag)
        await notifyClients({
          type: 'alarm-push-fired',
          dedup: tag,
          dateKey: alarm.dateKey,
        })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = absoluteUrl(event.notification.data && event.notification.data.url)
  const isAlarm = Boolean(event.notification.data && event.notification.data.alarm)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ('focus' in client) {
          if (isAlarm && 'navigate' in client) {
            try {
              await client.focus()
              return client.navigate(target)
            } catch {
              /* fall through */
            }
          }
          if (!isAlarm) client.postMessage({ type: 'futureme-open', url: target })
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
