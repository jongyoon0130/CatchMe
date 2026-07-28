import { planExactAlarmWake } from './alarmScheduler'
import { syncAlarmsToServiceWorker } from './alarmSwSync'
import { loadUserAlarms } from './userAlarms'
import {
  ensureAlarmPushReady,
  readNotifyEnv,
  requestNotifyPermission,
  type PushSubscribeResult,
} from './notify'
import { pushLocalAlarmData } from './alarmDataSync'
import { isCloudSyncAvailable } from './cloudSync'
import { getLockScreenAlarmStatus, registerLockScreenAlarm } from './alarmPushClient'

export type AlarmBootstrapResult = {
  ok: boolean
  blocker: string | null
  push: PushSubscribeResult | null
}

/** 켜진 알람이 있으면 — 권한·푸시·서버 동기화를 사용자 대신 자동으로 맞춘다 */
export async function bootstrapAlarmDelivery(opts?: {
  askPermission?: boolean
  forceRenew?: boolean
}): Promise<AlarmBootstrapResult> {
  const enabledAlarms = loadUserAlarms().filter((a) => a.enabled)
  if (!enabledAlarms.length) {
    return { ok: true, blocker: null, push: null }
  }

  const env = readNotifyEnv()
  if (!env.secure) {
    return { ok: false, blocker: 'https로 열어야 알람이 와요', push: null }
  }

  if (opts?.askPermission !== false && env.permission === 'default') {
    await requestNotifyPermission()
  }

  const after = readNotifyEnv()
  let push: PushSubscribeResult | null = null
  if (after.permission === 'granted') {
    push = await ensureAlarmPushReady(opts?.forceRenew === true)
    if (isCloudSyncAvailable()) {
      await pushLocalAlarmData().catch(() => {})
    }
    if (isCloudSyncAvailable() && after.permission === 'granted') {
      await registerLockScreenAlarm().catch(() => {})
    }
  }

  planExactAlarmWake()
  await syncAlarmsToServiceWorker()

  const status = await getLockScreenAlarmStatus()
  return { ok: status.ready, blocker: status.blocker, push }
}

export async function describeAlarmDeliveryBlocker(): Promise<string | null> {
  const enabledAlarms = loadUserAlarms().filter((a) => a.enabled)
  if (!enabledAlarms.length) return null
  const status = await getLockScreenAlarmStatus()
  return status.blocker
}
