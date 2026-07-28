import { supabase } from './supabase'
import {
  fetchRemoteAlarmData,
  fetchRemotePushSubscriptions,
  getActiveSyncUser,
  isCloudSyncAvailable,
} from './cloudSync'
import { pushLocalAlarmData } from './alarmDataSync'
import { loadUserAlarms } from './userAlarms'
import {
  ensureAlarmPushReady,
  readNotifyEnv,
  subscribeWebPush,
  type NotifyEnv,
} from './notify'

export type LockScreenAlarmStatus = {
  env: NotifyEnv
  loggedIn: boolean
  pushSubscriptionLocal: boolean
  pushSubscriptionOnServer: boolean
  alarmsOnServer: boolean
  alarmCount: number
  ready: boolean
  blocker: string | null
}

/** @deprecated use pushSubscriptionLocal */
export type LockScreenAlarmStatusLegacy = LockScreenAlarmStatus & { pushSubscription: boolean }

const APP_ORIGIN =
  typeof window !== 'undefined' && window.location.origin.startsWith('http')
    ? window.location.origin
    : 'https://future-me-studio.vercel.app'

/** 잠금 화면 알람(서버 푸시) 준비 상태 */
export async function getLockScreenAlarmStatus(): Promise<LockScreenAlarmStatus> {
  const env = readNotifyEnv()
  const loggedIn = isCloudSyncAvailable()
  const alarmCount = loadUserAlarms().filter((a) => a.enabled).length

  let pushSubscriptionLocal = false
  if (env.permission === 'granted' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      pushSubscriptionLocal = !!(await reg?.pushManager.getSubscription())
    } catch {
      pushSubscriptionLocal = false
    }
  }

  let pushSubscriptionOnServer = false
  let alarmsOnServer = false
  const userId = getActiveSyncUser()
  if (loggedIn && userId) {
    try {
      const remoteSubs = await fetchRemotePushSubscriptions(userId)
      pushSubscriptionOnServer = remoteSubs.length > 0
    } catch {
      pushSubscriptionOnServer = false
    }
    try {
      const row = await fetchRemoteAlarmData(userId)
      const remoteAlarms = Array.isArray(row?.alarms) ? row!.alarms : []
      alarmsOnServer = remoteAlarms.some((a) => (a as { enabled?: boolean }).enabled !== false)
    } catch {
      alarmsOnServer = false
    }
  }

  let blocker: string | null = null
  if (!env.secure) blocker = 'https로 열어야 해요'
  else if (env.isIOS && !env.standalone) blocker = '홈 화면에 추가한 앱으로 열어야 잠금 알람이 와요'
  else if (env.permission !== 'granted') blocker = '알림 허용이 필요해요'
  else if (!loggedIn) blocker = 'Google 로그인이 필요해요'
  else if (!pushSubscriptionLocal) blocker = '푸시 연결이 아직 없어요 — 아래 「연결하기」를 눌러주세요'
  else if (!pushSubscriptionOnServer) blocker = '서버에 푸시 연결이 없어요 — 아래 「연결하기」를 눌러주세요'
  else if (alarmCount > 0 && !alarmsOnServer) blocker = '알람이 서버에 없어요 — 아래 「연결하기」를 눌러주세요'

  const ready =
    !blocker &&
    alarmCount > 0 &&
    pushSubscriptionLocal &&
    pushSubscriptionOnServer &&
    alarmsOnServer

  return {
    env,
    loggedIn,
    pushSubscriptionLocal,
    pushSubscriptionOnServer,
    alarmsOnServer,
    alarmCount,
    ready,
    blocker,
  }
}

/** 로그인 + 알림 + 푸시 구독 + 알람 데이터를 서버에 올린다 */
export async function registerLockScreenAlarm(): Promise<{ ok: boolean; detail?: string }> {
  if (!isCloudSyncAvailable()) {
    return { ok: false, detail: 'Google 로그인 후 다시 시도해주세요.' }
  }

  const env = readNotifyEnv()
  if (env.isIOS && !env.standalone) {
    return { ok: false, detail: 'iPhone은 Safari 탭이 아니라 홈 화면 앱으로 열어주세요.' }
  }
  if (env.permission !== 'granted') {
    return { ok: false, detail: '먼저 「알림 허용하기」를 눌러주세요.' }
  }

  await ensureAlarmPushReady(true)
  await pushLocalAlarmData().catch(() => {})

  const sub = await subscribeWebPush(true)
  if (!sub.ok) {
    return { ok: false, detail: sub.detail ?? '푸시 구독에 실패했어요.' }
  }

  const status = await getLockScreenAlarmStatus()
  if (status.blocker) return { ok: false, detail: status.blocker }
  return { ok: true }
}

/** 서버에서 즉시 테스트 푸시 — 앱을 닫고 잠금 화면에서 알림 확인 */
export async function sendLockScreenTestPush(): Promise<{ ok: boolean; detail?: string }> {
  if (!supabase) return { ok: false, detail: 'Supabase가 설정되지 않았어요.' }
  if (!isCloudSyncAvailable()) return { ok: false, detail: 'Google 로그인이 필요해요.' }

  const prep = await registerLockScreenAlarm()
  if (!prep.ok) return prep

  const { data, error } = await supabase.functions.invoke('alarm-push', {
    body: { test: true, origin: APP_ORIGIN },
  })

  if (error) {
    return { ok: false, detail: error.message }
  }

  const result = data as { ok?: boolean; sent?: number; reason?: string; error?: string } | null
  if (!result?.ok) {
    return { ok: false, detail: result?.reason ?? result?.error ?? '푸시 발송 실패' }
  }
  if (!result.sent) {
    return {
      ok: false,
      detail: '서버에 푸시 구독이 없어요. 알림을 허용한 뒤 앱을 한 번 열어주세요.',
    }
  }

  return { ok: true }
}
