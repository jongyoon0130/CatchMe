import { isCloudSyncAvailableAsync } from './cloudSync'
import { getLockScreenAlarmStatus } from './alarmPushClient'
import { readNotifyEnv, type NotifyEnv } from './notify'
import { isIosNative } from './platform'
import { getNativeAlarmStatus, type NativeAlarmStatus } from './nativeAlarm'
import { loadUserAlarms } from './userAlarms'

export type AlarmSettingStatus = 'ok' | 'warn' | 'error' | 'unknown'

export type AlarmSettingItem = {
  id: string
  label: string
  status: AlarmSettingStatus
  detail: string
}

export type AlarmSettingsSnapshot = {
  items: AlarmSettingItem[]
  needsAttention: boolean
  isNativeIos: boolean
  env: NotifyEnv
  native: NativeAlarmStatus | null
}

function permissionStatus(p: string | undefined): AlarmSettingStatus {
  if (p === 'granted') return 'ok'
  if (p === 'denied') return 'error'
  if (p === 'prompt' || p === 'default') return 'warn'
  return 'unknown'
}

function permissionLabel(p: string | undefined): string {
  switch (p) {
    case 'granted':
      return '허용됨'
    case 'denied':
      return '거부됨'
    case 'prompt':
    case 'default':
      return '아직 허용 안 함'
    default:
      return '확인 필요'
  }
}

function nativeItems(native: NativeAlarmStatus, enabledCount: number): AlarmSettingItem[] {
  const items: AlarmSettingItem[] = [
    {
      id: 'alarmkit',
      label: '잠금 화면 알람 (AlarmKit)',
      status: permissionStatus(native.alarmKitPermission ?? (native.alarmKitEntitled ? 'granted' : 'prompt')),
      detail: permissionLabel(native.alarmKitPermission ?? (native.alarmKitEntitled ? 'granted' : 'prompt')),
    },
    {
      id: 'notify',
      label: '알림 (푸시)',
      status: permissionStatus(native.notificationPermission),
      detail: permissionLabel(native.notificationPermission),
    },
    {
      id: 'scheduled',
      label: '예약된 알람',
      status: enabledCount > 0 && native.scheduledCount > 0 ? 'ok' : enabledCount > 0 ? 'warn' : 'unknown',
      detail:
        enabledCount > 0
          ? `${native.scheduledCount}개 예약 · 켜진 알람 ${enabledCount}개`
          : '켜진 알람이 없어요',
    },
  ]
  if (native.message?.trim()) {
    items.push({
      id: 'native-note',
      label: '상태',
      status: 'unknown',
      detail: native.message.trim(),
    })
  }
  return items
}

async function webItems(): Promise<AlarmSettingItem[]> {
  const lock = await getLockScreenAlarmStatus()
  const loggedIn = await isCloudSyncAvailableAsync()
  const items: AlarmSettingItem[] = [
    {
      id: 'notify',
      label: '알림 권한',
      status: permissionStatus(lock.env.permission),
      detail: permissionLabel(lock.env.permission),
    },
  ]

  if (!lock.env.standalone && lock.env.isIOS) {
    items.push({
      id: 'pwa',
      label: '홈 화면 설치',
      status: 'error',
      detail: 'Safari 공유 → 홈 화면에 추가 후 그 아이콘으로 열어야 해요',
    })
  }

  if (loggedIn) {
    items.push({
      id: 'push-local',
      label: '푸시 연결 (기기)',
      status: lock.pushSubscriptionLocal ? 'ok' : 'warn',
      detail: lock.pushSubscriptionLocal ? '연결됨' : '연결 필요',
    })
    items.push({
      id: 'push-server',
      label: '푸시 연결 (서버)',
      status: lock.pushSubscriptionOnServer ? 'ok' : 'warn',
      detail: lock.pushSubscriptionOnServer ? '연결됨' : '연결 필요',
    })
  } else {
    items.push({
      id: 'login',
      label: 'Google 로그인',
      status: 'warn',
      detail: '잠금 화면 알람 백업에 필요해요',
    })
  }

  if (lock.blocker && !lock.ready) {
    items.push({
      id: 'delivery',
      label: '알람 전달',
      status: 'warn',
      detail: lock.blocker,
    })
  }

  return items
}

export async function loadAlarmSettingsSnapshot(): Promise<AlarmSettingsSnapshot> {
  const env = readNotifyEnv()
  const enabledCount = loadUserAlarms().filter((a) => a.enabled).length
  const nativeIos = isIosNative()

  if (nativeIos) {
    const native = await getNativeAlarmStatus()
    const items = nativeItems(native, enabledCount)
    const needsAttention = items.some((item) => item.status === 'warn' || item.status === 'error')
    return { items, needsAttention, isNativeIos: true, env, native }
  }

  const items = await webItems()
  const needsAttention = items.some((item) => item.status === 'warn' || item.status === 'error')
  return { items, needsAttention, isNativeIos: false, env, native: null }
}
