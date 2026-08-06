import { Capacitor, registerPlugin } from '@capacitor/core'
import type {
  AlarmAlertMode,
  FutureMeAlarmPlugin,
  NativeAlarmDebugInfo,
  NativeAlarmFiredEvent,
  NativeAlarmStatus,
} from './types'
import { NATIVE_ALARM_FIRED_EVENT } from './types'

export const FutureMeAlarm = registerPlugin<FutureMeAlarmPlugin>('FutureMeAlarm', {
  web: () => import('./futureMeAlarmWeb').then((m) => new m.FutureMeAlarmWeb()),
})

export function isNativeAlarmAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** 개발 빌드에서만 디버그 UI·시뮬레이션 API 노출 */
export function isNativeAlarmDevMode(): boolean {
  return import.meta.env.DEV
}

export async function getNativeAlarmStatus(): Promise<NativeAlarmStatus> {
  try {
    return await FutureMeAlarm.getStatus()
  } catch {
    return {
      platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'web',
      mode: 'unavailable',
      alarmKitEntitled: false,
      notificationPermission: 'unknown',
      scheduledCount: 0,
      message: '네이티브 알람 플러그인을 불러올 수 없어요',
    }
  }
}

export async function requestNativeNotificationPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  try {
    const { permission } = await FutureMeAlarm.requestNotificationPermission()
    if (permission === 'granted') return 'granted'
    if (permission === 'denied') return 'denied'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function simulateNativeAlarmFire(event: {
  alarmId: string
  label: string
  time: string
  phrase: string
}): Promise<boolean> {
  try {
    const { ok } = await FutureMeAlarm.simulateAlarm(event)
    return ok
  } catch {
    return false
  }
}

export async function scheduleNativeTestNotification(opts: {
  seconds?: number
  alarmId: string
  label: string
  time: string
  phrase: string
  alertMode?: AlarmAlertMode
}): Promise<{
  ok: boolean
  ringCount?: number
  pushCount?: number
  intentsAttached?: boolean
  detail?: string
}> {
  try {
    const result = await FutureMeAlarm.scheduleTestNotification(opts)
    return {
      ok: result.ok,
      ringCount: result.ringCount,
      pushCount: result.pushCount,
      intentsAttached: result.intentsAttached,
      detail: result.detail,
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : undefined }
  }
}

export async function getNativeAlarmDebugInfo(): Promise<NativeAlarmDebugInfo> {
  try {
    return await FutureMeAlarm.getDebugInfo()
  } catch {
    return { plans: [], log: ['디버그 정보를 읽을 수 없어요'] }
  }
}

export async function cancelNativePendingAlarms(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) return false
  try {
    const { ok } = await FutureMeAlarm.cancelAllPending()
    return ok
  } catch {
    return false
  }
}

export async function pulseNativeAlarmHaptic(): Promise<void> {
  if (!isNativeAlarmAvailable()) return
  try {
    await FutureMeAlarm.pulseAlarmHaptic()
  } catch {
    /* ignore */
  }
}

export async function setNativeAlarmAlertMode(mode: AlarmAlertMode): Promise<void> {
  if (!isNativeAlarmAvailable()) return
  try {
    await FutureMeAlarm.setAlertMode({ mode })
  } catch {
    /* ignore */
  }
}

export async function stopNativeActiveAlarm(opts: {
  alarmId?: string
  alarmKitId?: string
}): Promise<void> {
  if (!isNativeAlarmAvailable()) return
  try {
    await FutureMeAlarm.stopActiveAlarm(opts)
  } catch {
    /* ignore */
  }
}

export async function syncNativeTaskReminders(
  reminders: Array<{
    fire_date: string
    fire_time: string
    kind: 'start' | 'end'
    item_id: string
    label: string
  }>,
): Promise<{ ok: boolean; scheduled?: number; detail?: string }> {
  if (!isNativeAlarmAvailable()) return { ok: false, detail: 'not_native' }
  try {
    const result = await FutureMeAlarm.syncTaskReminders({ reminders })
    return { ok: result.ok, scheduled: result.scheduled, detail: result.detail }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : undefined }
  }
}

export async function getNativeTaskReminderCount(): Promise<number> {
  if (!isNativeAlarmAvailable()) return 0
  try {
    const { count } = await FutureMeAlarm.getTaskReminderCount()
    return count
  } catch {
    return 0
  }
}

export type NativeAlarmListener = (event: NativeAlarmFiredEvent) => void

export function attachNativeAlarmFiredListener(onFire: NativeAlarmListener): () => void {
  let capHandle: { remove: () => void } | null = null
  let cancelled = false

  void FutureMeAlarm.addListener('alarmFired', (event) => {
    if (!cancelled) onFire(event)
  }).then((handle) => {
    if (cancelled) {
      handle.remove()
    } else {
      capHandle = handle
    }
  })

  const onDom = (e: Event) => {
    const detail = (e as CustomEvent<NativeAlarmFiredEvent>).detail
    if (detail) onFire(detail)
  }
  window.addEventListener(NATIVE_ALARM_FIRED_EVENT, onDom)

  return () => {
    cancelled = true
    capHandle?.remove()
    window.removeEventListener(NATIVE_ALARM_FIRED_EVENT, onDom)
  }
}
