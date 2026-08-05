import type { AlarmAlertMode } from './nativeAlarm/types'
import { isNativeAlarmAvailable, setNativeAlarmAlertMode } from './nativeAlarm/plugin'

export type { AlarmAlertMode } from './nativeAlarm/types'

const STORAGE_KEY = 'futureme-alarm-alert-mode'
export const ALARM_ALERT_MODE_CHANGE = 'futureme-alarm-alert-mode-change'

export function loadAlarmAlertMode(): AlarmAlertMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'sound' || raw === 'vibrate' || raw === 'silent') return raw
  } catch {
    /* ignore */
  }
  return 'vibrate'
}

export function saveAlarmAlertMode(mode: AlarmAlertMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
    window.dispatchEvent(new CustomEvent(ALARM_ALERT_MODE_CHANGE, { detail: mode }))
    if (isNativeAlarmAvailable()) {
      void setNativeAlarmAlertMode(mode)
    }
  } catch {
    /* ignore */
  }
}

export function describeAlarmAlertMode(mode: AlarmAlertMode): string {
  if (mode === 'sound') return '소리 + 진동'
  if (mode === 'vibrate') return '진동만'
  return '무음'
}
