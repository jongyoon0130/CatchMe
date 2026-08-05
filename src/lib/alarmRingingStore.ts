import { clockAlarmDedupKey, type ClockAlarmTrigger } from './clockAlarmEngine'

export interface RingingAlarm {
  trigger: ClockAlarmTrigger
  phrase: string
  startedAt: number
  alarmKitId?: string
}

const PENDING_KEY = 'futureme-alarm-pending-dismiss'
const PHRASE_DONE_KEY = 'futureme-alarm-phrase-done-sessions'
export const ALARM_RINGING_CHANGE = 'futureme-alarm-ringing-change'

let ringing: RingingAlarm | null = null
/** 방금 해제한 알람 — 해제 직후 뒤늦게 온 중복 경로(SW)가 되살리는 것을 이 시간 창에서만 막는다 */
let lastHandled: { dedup: string; at: number } | null = null
const DUP_WINDOW_MS = 60_000
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
  window.dispatchEvent(new CustomEvent(ALARM_RINGING_CHANGE))
}

function loadPhraseDoneSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(PHRASE_DONE_KEY)
    if (!raw) return new Set()
    const list = JSON.parse(raw) as string[]
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

function savePhraseDoneSessions(sessions: Set<string>): void {
  try {
    localStorage.setItem(PHRASE_DONE_KEY, JSON.stringify([...sessions]))
  } catch {
    /* ignore */
  }
}

export function phraseSessionKey(trigger: ClockAlarmTrigger): string {
  return `${trigger.alarmId}:${trigger.dateKey}`
}

/** 오늘 이 알람 세션에서 다짐 입력을 이미 완료했는지 */
export function isPhraseSessionDone(trigger: ClockAlarmTrigger): boolean {
  return loadPhraseDoneSessions().has(phraseSessionKey(trigger))
}

/** 다짐 입력 완료 — 같은 날 재울림·푸시가 와도 오버레이를 다시 띄우지 않음 */
export function markPhraseSessionDone(trigger: ClockAlarmTrigger): void {
  const done = loadPhraseDoneSessions()
  done.add(phraseSessionKey(trigger))
  savePhraseDoneSessions(done)
  lastHandled = { dedup: clockAlarmDedupKey(trigger), at: Date.now() }
}

/** 네이티브 재동기화 시 — 같은 날 JS 쪽 '완료' 표시를 지워 AlarmKit 울림 후 따라치기가 막히지 않게 */
export function clearPhraseSessionDoneForAlarms(alarmIds: string[], dateKey?: string): void {
  const key = dateKey ?? new Date().toISOString().slice(0, 10)
  const done = loadPhraseDoneSessions()
  for (const alarmId of alarmIds) {
    done.delete(`${alarmId}:${key}`)
  }
  savePhraseDoneSessions(done)
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

/**
 * @param opts.force 네이티브(AlarmKit)가 알린 울림 — JS 쪽 중복 방지 필터를 건너뛴다.
 *   네이티브는 다짐 완료된 체인을 이미 걸러내므로, 여기서 다시 막으면 오버레이가 안 뜬다.
 */
export function startRingingAlarm(
  trigger: ClockAlarmTrigger,
  phrase: string,
  alarmKitId?: string,
  opts?: { force?: boolean },
): void {
  const dedup = clockAlarmDedupKey(trigger)
  // 같은 알람이 이미 울리는 중이면 덮어쓰지 않는다 — 먼저 뜬 게 유지
  if (ringing && clockAlarmDedupKey(ringing.trigger) === dedup) return
  if (!opts?.force) {
    if (isPhraseSessionDone(trigger)) return
    // 방금 해제한 알람이 뒤늦게 온 중복 경로로 되살아나는 것 막기 (짧은 창에서만)
    if (lastHandled && lastHandled.dedup === dedup && Date.now() - lastHandled.at < DUP_WINDOW_MS) {
      return
    }
  }
  ringing = { trigger, phrase, startedAt: Date.now(), alarmKitId }
  persistPending(ringing)
  emit()
}

export function stopRingingAlarm(): void {
  if (ringing) lastHandled = { dedup: clockAlarmDedupKey(ringing.trigger), at: Date.now() }
  ringing = null
  persistPending(null)
  emit()
}
