import { planExactAlarmWake } from './alarmScheduler'
import { loadUserAlarms } from './userAlarms'
import {
  ensureAlarmPushReady,
  readNotifyEnv,
  requestNotifyPermission,
} from './notify'
import { pushLocalAlarmData } from './alarmDataSync'
import { isCloudSyncAvailable } from './cloudSync'

/** 켜진 알람이 있으면 — 권한·푸시·서버 동기화를 사용자 대신 자동으로 맞춘다 */
export async function bootstrapAlarmDelivery(opts?: { askPermission?: boolean }): Promise<void> {
  const enabledAlarms = loadUserAlarms().filter((a) => a.enabled)
  if (!enabledAlarms.length) return

  const env = readNotifyEnv()
  if (!env.secure) return

  if (opts?.askPermission !== false && env.permission === 'default') {
    await requestNotifyPermission()
  }

  const after = readNotifyEnv()
  if (after.permission === 'granted') {
    await ensureAlarmPushReady()
    if (isCloudSyncAvailable()) {
      await pushLocalAlarmData().catch(() => {})
    }
  }

  planExactAlarmWake()
}

export function describeAlarmDeliveryBlocker(): string | null {
  const enabledAlarms = loadUserAlarms().filter((a) => a.enabled)
  if (!enabledAlarms.length) return null

  const env = readNotifyEnv()
  if (!env.secure) return 'https로 열어야 알람이 와요'
  if (env.isIOS && !env.standalone) {
    return 'iPhone은 Safari 탭이 아니라 「홈 화면에 추가」한 앱으로 열어야 백그라운드 알람이 와요'
  }
  if (env.permission === 'denied') {
    return '알림이 꺼져 있어요 — 설정에서 Future Me 알림을 허용해주세요'
  }
  if (env.permission === 'default') {
    return '알림 허용만 하면 설정한 시간에 자동으로 울려요'
  }
  if (!isCloudSyncAvailable()) {
    return 'Google 로그인하면 앱을 닫아도 알람이 와요 (지금은 앱이 켜져 있을 때만)'
  }
  return null
}
