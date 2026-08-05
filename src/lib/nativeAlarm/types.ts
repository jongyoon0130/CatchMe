/** iOS 네이티브 알람 Bridge — AlarmKit (iOS 26+) */
export type NativeAlarmMode = 'unavailable' | 'mock' | 'alarmkit' | 'error'

export type NativeNotificationPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** 알람 울림 방식 — 앱·푸시 (AlarmKit 잠금 화면은 iOS 제한) */
export type AlarmAlertMode = 'sound' | 'vibrate' | 'silent'

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
  /** AlarmKit 알람 권한 */
  alarmKitPermission?: NativeNotificationPermission
  scheduledCount: number
  /** 울렸는데 아직 다짐을 안 친 알람이 있는지 */
  hasAwaitingPhrase?: boolean
  /** AlarmKit 에 실제로 등록된 알람 개수 */
  alarmKitScheduledCount?: number
  message?: string
}

/** 예약된 울림 체인 요약 — 디버그 패널 */
export interface NativeAlarmPlanInfo {
  alarmId: string
  label: string
  time: string
  firstFireAt: string
  ringsTotal: number
  ringsRemaining: number
  liveInAlarmKit: number
  completed: boolean
  awaitingPhrase: boolean
  isTest: boolean
}

export interface NativeAlarmDebugInfo {
  plans: NativeAlarmPlanInfo[]
  log: string[]
  alarmKitScheduledCount?: number
  pendingPushCount?: number
  alertMode?: AlarmAlertMode
}

export interface NativeAlarmFiredEvent {
  alarmId: string
  label: string
  time: string
  phrase: string
  dateKey: string
  alarmKitId?: string
  source?: string
}

export interface FutureMeAlarmPlugin {
  getStatus(): Promise<NativeAlarmStatus>
  syncAlarms(options: {
    alarms: NativeAlarmRecord[]
    alertMode?: AlarmAlertMode
  }): Promise<{ ok: boolean; count: number; mode?: string; detail?: string }>
  simulateAlarm(options: {
    alarmId: string
    label: string
    time: string
    phrase: string
  }): Promise<{ ok: boolean }>
  requestNotificationPermission(): Promise<{
    permission: string
    notificationPermission?: string
  }>
  scheduleTestNotification(options: {
    seconds?: number
    alarmId?: string
    label?: string
    time?: string
    phrase?: string
    alertMode?: AlarmAlertMode
  }): Promise<{
    ok: boolean
    seconds?: number
    mode?: string
    ringCount?: number
    pushCount?: number
    intentsAttached?: boolean
    detail?: string
  }>
  /** 다짐 완료 — 남은 울림 체인 전부 취소 */
  stopActiveAlarm(options: {
    alarmId?: string
    alarmKitId?: string
  }): Promise<{ ok: boolean; detail?: string }>
  getPendingDismiss(): Promise<{ pending: false } | ({ pending: true } & NativeAlarmFiredEvent)>
  cancelAllPending(): Promise<{ ok: boolean }>
  /** 남은 울림이 적으면 체인을 다시 채운다 */
  refillChain(): Promise<{ ok: boolean }>
  pulseAlarmHaptic(): Promise<{ ok: boolean }>
  setAlertMode(options: { mode: AlarmAlertMode }): Promise<{ ok: boolean; mode?: AlarmAlertMode }>
  getDebugInfo(): Promise<NativeAlarmDebugInfo>
  addListener(
    eventName: 'alarmFired',
    listenerFunc: (event: NativeAlarmFiredEvent) => void,
  ): Promise<{ remove: () => void }>
}

export const NATIVE_ALARM_FIRED_EVENT = 'futureme-native-alarm-fired'
