import { Capacitor, registerPlugin } from '@capacitor/core'
import type { FutureMeAlarmPlugin, NativeAlarmFiredEvent, NativeAlarmStatus } from './types'
import { NATIVE_ALARM_FIRED_EVENT } from './types'

export const FutureMeAlarm = registerPlugin<FutureMeAlarmPlugin>('FutureMeAlarm', {
  web: () => import('./futureMeAlarmWeb').then((m) => new m.FutureMeAlarmWeb()),
})

export function isNativeAlarmAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export function isNativeAlarmDevMode(): boolean {
  return isNativeAlarmAvailable() || import.meta.env.DEV
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
}): Promise<boolean> {
  try {
    const { ok } = await FutureMeAlarm.scheduleTestNotification(opts)
    return ok
  } catch {
    return false
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
