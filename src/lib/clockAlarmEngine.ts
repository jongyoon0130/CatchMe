import type { UserAlarm } from './userAlarms'
import { normalizeTaskTime } from './goalTaskTime'

export interface ClockAlarmTrigger {
  alarmId: string
  label: string
  time: string
  dateKey: string
}

export function dateKeyFrom(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 1회성 알람 — 다음 울릴 날짜 (오늘 시각 지났으면 내일) */
export function computeOneShotDateKey(time24: string, now = new Date()): string {
  const [hour, minute] = time24.split(':').map(Number)
  const at = new Date(now)
  if (Number.isFinite(hour) && Number.isFinite(minute)) {
    at.setHours(hour, minute, 0, 0)
  }
  if (at.getTime() <= now.getTime()) {
    at.setDate(at.getDate() + 1)
  }
  return dateKeyFrom(at)
}

/** 오늘 이 알람이 울려야 하는 요일인지 (enabled 무시 — UI 미리보기용) */
export function userAlarmScheduledOnDate(alarm: UserAlarm, date: Date): boolean {
  const time = normalizeTaskTime(alarm.time)
  if (!time) return false
  if (!alarm.repeatDays.length) {
    const target = alarm.oneShotDateKey ?? computeOneShotDateKey(time)
    return dateKeyFrom(date) === target
  }
  return alarm.repeatDays.includes(date.getDay())
}

/** 오늘 이 알람이 울려야 하는 요일인지 */
export function userAlarmActiveOnDate(alarm: UserAlarm, date: Date): boolean {
  if (!alarm.enabled) return false
  return userAlarmScheduledOnDate(alarm, date)
}

export function collectClockAlarms(
  alarms: UserAlarm[],
  date: Date,
  opts?: { includeDisabled?: boolean },
): ClockAlarmTrigger[] {
  const dateKey = dateKeyFrom(date)
  const out: ClockAlarmTrigger[] = []
  for (const alarm of alarms) {
    const active = opts?.includeDisabled
      ? userAlarmScheduledOnDate(alarm, date)
      : userAlarmActiveOnDate(alarm, date)
    if (!active) continue
    const time = normalizeTaskTime(alarm.time)
    if (!time) continue
    out.push({ alarmId: alarm.id, label: alarm.label, time, dateKey })
  }
  return out
}

export function clockAlarmDedupKey(trigger: ClockAlarmTrigger): string {
  return `clock:${trigger.dateKey}:${trigger.alarmId}:${trigger.time}`
}

export function isClockAlarmDue(
  trigger: ClockAlarmTrigger,
  now: Date,
  opts?: { graceSeconds?: number },
): boolean {
  const graceSeconds = opts?.graceSeconds ?? 59
  if (trigger.dateKey !== dateKeyFrom(now)) return false

  const [hour, minute] = trigger.time.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false

  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)
  const diffMs = now.getTime() - target.getTime()
  return diffMs >= 0 && diffMs <= graceSeconds * 1000
}

export function filterDueClockAlarms(
  triggers: ClockAlarmTrigger[],
  now: Date,
  fired: ReadonlySet<string>,
): ClockAlarmTrigger[] {
  return triggers.filter((t) => !fired.has(clockAlarmDedupKey(t)) && isClockAlarmDue(t, now))
}

export function findNextClockAlarm(
  alarms: UserAlarm[],
  now: Date,
  fired: ReadonlySet<string>,
  opts?: { includeDisabled?: boolean },
): ClockAlarmTrigger | null {
  let best: { trigger: ClockAlarmTrigger; at: number } | null = null

  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    for (const trigger of collectClockAlarms(alarms, day, opts)) {
      if (fired.has(clockAlarmDedupKey(trigger))) continue
      const [hour, minute] = trigger.time.split(':').map(Number)
      const at = new Date(day)
      at.setHours(hour, minute, 0, 0)
      if (at.getTime() <= now.getTime()) continue
      if (!best || at.getTime() < best.at) {
        best = { trigger, at: at.getTime() }
      }
    }
    if (best) break
  }

  return best?.trigger ?? null
}
