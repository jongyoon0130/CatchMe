import { supabase } from './supabase'
import {
  fetchAlarmCronHeartbeat,
  fetchRemoteAlarmData,
  fetchRemotePushSubscriptions,
  isCloudSyncAvailableAsync,
  resolveSyncClient,
} from './cloudSync'
import { pushLocalAlarmData } from './alarmDataSync'
import { loadUserAlarms } from './userAlarms'
import {
  describePushSubscribeFailure,
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
  cronHealthy: boolean
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
  const loggedIn = await isCloudSyncAvailableAsync()
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
  let cronHealthy = false
  let infraError: string | null = null
  const ctx = loggedIn ? await resolveSyncClient() : null
  const userId = ctx?.userId ?? null
  if (loggedIn && userId) {
    try {
      const remoteSubs = await fetchRemotePushSubscriptions(userId)
      pushSubscriptionOnServer = remoteSubs.length > 0
    } catch (e) {
      pushSubscriptionOnServer = false
      const msg = e instanceof Error ? e.message : String(e)
      if (/futureme_push_subscriptions|does not exist|42P01/i.test(msg)) {
        infraError = '서버 DB에 푸시 테이블이 없어요 (Supabase SQL 설정 필요)'
      }
    }
    try {
      const row = await fetchRemoteAlarmData(userId)
      const remoteAlarms = Array.isArray(row?.alarms) ? row!.alarms : []
      alarmsOnServer = remoteAlarms.some((a) => (a as { enabled?: boolean }).enabled !== false)
    } catch {
      alarmsOnServer = false
    }
  }

  try {
    const heartbeat = await fetchAlarmCronHeartbeat()
    if (heartbeat?.last_run_at) {
      cronHealthy = Date.now() - heartbeat.last_run_at < 3 * 60 * 1000
    }
  } catch {
    cronHealthy = false
  }

  let blocker: string | null = infraError
  if (!blocker && !env.secure) blocker = 'https로 열어야 해요'
  else if (!blocker && env.isIOS && !env.standalone) blocker = '홈 화면에 추가한 앱으로 열어야 잠금 알람이 와요'
  else if (!blocker && env.permission !== 'granted') blocker = '알림 허용이 필요해요'
  else if (!blocker && !loggedIn) blocker = 'Google 로그인이 필요해요'
  else if (!blocker && !pushSubscriptionLocal) blocker = '푸시 연결이 아직 없어요 — 아래 「연결하기」를 눌러주세요'
  else if (!blocker && !pushSubscriptionOnServer) blocker = '서버에 푸시 연결이 없어요 — 아래 「연결하기」를 눌러주세요'
  else if (!blocker && alarmCount > 0 && !alarmsOnServer) blocker = '알람이 서버에 없어요 — 아래 「연결하기」를 눌러주세요'
  else if (!blocker && alarmCount > 0 && !cronHealthy) {
    blocker =
      '서버 알람 스케줄러(매분 크론)가 꺼져 있어요 — Supabase SQL의 cron 블록을 실행해야 앱을 안 열어도 울려요'
  }

  const ready =
    !blocker &&
    alarmCount > 0 &&
    pushSubscriptionLocal &&
    pushSubscriptionOnServer &&
    alarmsOnServer &&
    cronHealthy

  return {
    env,
    loggedIn,
    pushSubscriptionLocal,
    pushSubscriptionOnServer,
    alarmsOnServer,
    alarmCount,
    cronHealthy,
    ready,
    blocker,
  }
}

function formatCloudSaveError(msg: string): string {
  if (/42703|column.*does not exist/i.test(msg)) {
    return '서버 DB 스키마가 옛버전이에요. Supabase SQL Editor에서 fix_push_subscriptions.sql 을 실행해주세요'
  }
  if (/42P01|does not exist/i.test(msg)) {
    return '서버 DB 테이블이 없어요. Supabase SQL 설정이 필요해요'
  }
  if (/no unique|on conflict|42P10/i.test(msg)) {
    return '서버 DB에 unique(user_id, endpoint) 인덱스가 필요해요 — fix_push_subscriptions.sql 실행'
  }
  if (/JWT|401|403|row-level security|RLS/i.test(msg)) {
    return '로그인 세션이 만료됐을 수 있어요. 로그아웃 후 Google로 다시 로그인해주세요'
  }
  return msg
}
export async function registerLockScreenAlarm(): Promise<{ ok: boolean; detail?: string }> {
  const env = readNotifyEnv()

  if (env.isIOS && !env.standalone) {
    return { ok: false, detail: 'iPhone은 Safari 탭이 아니라 홈 화면 앱으로 열어주세요.' }
  }
  if (env.permission !== 'granted') {
    return { ok: false, detail: '먼저 「알림 허용하기」를 눌러주세요.' }
  }

  const loggedIn = await isCloudSyncAvailableAsync()
  if (!loggedIn) {
    return { ok: false, detail: 'Google 로그인 후 다시 시도해주세요.' }
  }

  const push = await subscribeWebPush(true)
  if (!push.ok) {
    return { ok: false, detail: describePushSubscribeFailure(push, env) }
  }

  try {
    await pushLocalAlarmData()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, detail: formatCloudSaveError(msg) }
  }

  const status = await getLockScreenAlarmStatus()
  if (status.blocker) return { ok: false, detail: status.blocker }
  return { ok: true }
}

/** 서버에서 즉시 테스트 푸시 — 앱을 닫고 잠금 화면에서 알림 확인 */
export async function sendLockScreenTestPush(): Promise<{ ok: boolean; detail?: string }> {
  if (!supabase) return { ok: false, detail: 'Supabase가 설정되지 않았어요.' }
  if (!(await isCloudSyncAvailableAsync())) return { ok: false, detail: 'Google 로그인이 필요해요.' }

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
