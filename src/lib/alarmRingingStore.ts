import type { ClockAlarmTrigger } from './clockAlarmEngine'

export interface RingingAlarm {
  trigger: ClockAlarmTrigger
  phrase: string
  startedAt: number
}

const PENDING_KEY = 'futureme-alarm-pending-dismiss'
export const ALARM_RINGING_CHANGE = 'futureme-alarm-ringing-change'

let ringing: RingingAlarm | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
  window.dispatchEvent(new CustomEvent(ALARM_RINGING_CHANGE))
}

function persistPending(value: RingingAlarm | null): void {
  try {
    if (!value) {
      localStorage.removeItem(PENDING_KEY)
      return
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function loadPendingDismiss(): RingingAlarm | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as RingingAlarm
    if (!data?.trigger?.alarmId || !data.phrase?.trim()) return null
    return data
  } catch {
    return null
  }
}

export function getRingingAlarm(): RingingAlarm | null {
  return ringing
}

export function subscribeRingingAlarm(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  const onEvent = () => onStoreChange()
  window.addEventListener(ALARM_RINGING_CHANGE, onEvent)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener(ALARM_RINGING_CHANGE, onEvent)
  }
}

export function startRingingAlarm(trigger: ClockAlarmTrigger, phrase: string): void {
  ringing = { trigger, phrase, startedAt: Date.now() }
  persistPending(ringing)
  emit()
}

export function stopRingingAlarm(): void {
  ringing = null
  persistPending(null)
  emit()
}
