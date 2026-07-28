/** iOS 네이티브 알람 Bridge — AlarmKit entitlement 전 mock 포함 */
export type NativeAlarmMode = 'unavailable' | 'mock' | 'alarmkit'

export type NativeNotificationPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface NativeAlarmRecord {
  id: string
  time: string
  label: string
  enabled: boolean
  repeatDays: number[]
  phrase: string
}

export interface NativeAlarmStatus {
  platform: 'web' | 'ios'
  mode: NativeAlarmMode
  alarmKitEntitled: boolean
  notificationPermission: NativeNotificationPermission
  scheduledCount: number
  message?: string
}

export interface NativeAlarmFiredEvent {
  alarmId: string
  label: string
  time: string
  phrase: string
  dateKey: string
  source?: string
}

export interface FutureMeAlarmPlugin {
  getStatus(): Promise<NativeAlarmStatus>
  syncAlarms(options: { alarms: NativeAlarmRecord[] }): Promise<{ ok: boolean; count: number; mode?: string }>
  simulateAlarm(options: {
    alarmId: string
    label: string
    time: string
    phrase: string
  }): Promise<{ ok: boolean }>
  requestNotificationPermission(): Promise<{ permission: string }>
  scheduleTestNotification(options: {
    seconds?: number
    alarmId?: string
    label?: string
    time?: string
    phrase?: string
  }): Promise<{ ok: boolean; seconds?: number }>
  addListener(
    eventName: 'alarmFired',
    listenerFunc: (event: NativeAlarmFiredEvent) => void,
  ): Promise<{ remove: () => void }>
}

export const NATIVE_ALARM_FIRED_EVENT = 'futureme-native-alarm-fired'
