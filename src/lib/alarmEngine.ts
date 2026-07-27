import type { AggregatedItem } from './goalHierarchyEngine'
import { MISC_PLAN_TITLE } from './goalMiscTodos'
import { normalizeTaskTime } from './goalTaskTime'

export type AlarmKind = 'start' | 'end'

export interface ScheduledAlarm {
  itemId: string
  label: string
  planTitle: string
  kind: AlarmKind
  /** 24h HH:mm */
  time: string
  /** YYYY-MM-DD */
  dateKey: string
  done: boolean
}

export function dateKeyFrom(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function collectScheduledAlarms(items: AggregatedItem[], dateKey: string): ScheduledAlarm[] {
  const out: ScheduledAlarm[] = []
  for (const item of items) {
    const start = normalizeTaskTime(item.timeStart)
    const end = normalizeTaskTime(item.timeEnd)
    if (start) {
      out.push({
        itemId: item.id,
        label: item.label,
        planTitle: item.planTitle,
        kind: 'start',
        time: start,
        dateKey,
        done: item.done,
      })
    }
    if (end) {
      out.push({
        itemId: item.id,
        label: item.label,
        planTitle: item.planTitle,
        kind: 'end',
        time: end,
        dateKey,
        done: item.done,
      })
    }
  }
  return out
}

export function alarmDedupKey(alarm: ScheduledAlarm): string {
  return `${alarm.dateKey}:${alarm.itemId}:${alarm.kind}:${alarm.time}`
}

/** 지정 시각이 현재 분과 같거나, graceMinutes 이내에 지났으면 울릴 대상 */
export function isAlarmDue(
  alarm: ScheduledAlarm,
  now: Date,
  opts?: { graceMinutes?: number; todayKey?: string },
): boolean {
  const graceMinutes = opts?.graceMinutes ?? 2
  const todayKey = opts?.todayKey ?? dateKeyFrom(now)
  if (alarm.dateKey !== todayKey) return false
  if (alarm.done) return false

  const [hour, minute] = alarm.time.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false

  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)

  const diffMs = now.getTime() - target.getTime()
  return diffMs >= 0 && diffMs < graceMinutes * 60 * 1000
}

export function formatAlarmTitle(alarm: ScheduledAlarm): string {
  return alarm.kind === 'start' ? '이제 시작할 시간이야' : '잘 끝났어?'
}

export function formatAlarmBody(alarm: ScheduledAlarm): string {
  const prefix =
    alarm.planTitle && alarm.planTitle !== '일상' && alarm.planTitle !== MISC_PLAN_TITLE
      ? `${alarm.planTitle} · `
      : ''
  if (alarm.kind === 'start') return `${prefix}${alarm.label}`
  return `${prefix}${alarm.label} — 기록해두자`
}

export function filterDueAlarms(
  alarms: ScheduledAlarm[],
  now: Date,
  fired: ReadonlySet<string>,
  settings: { startAlarms: boolean; endAlarms: boolean },
): ScheduledAlarm[] {
  return alarms.filter((alarm) => {
    if (alarm.kind === 'start' && !settings.startAlarms) return false
    if (alarm.kind === 'end' && !settings.endAlarms) return false
    if (fired.has(alarmDedupKey(alarm))) return false
    return isAlarmDue(alarm, now)
  })
}

/** UI용 — 아직 안 울린 다음 알람 */
export function findNextAlarm(
  alarms: ScheduledAlarm[],
  now: Date,
  fired: ReadonlySet<string>,
): ScheduledAlarm | null {
  const todayKey = dateKeyFrom(now)
  let best: { alarm: ScheduledAlarm; at: number } | null = null

  for (const alarm of alarms) {
    if (alarm.dateKey !== todayKey) continue
    if (alarm.done) continue
    if (fired.has(alarmDedupKey(alarm))) continue

    const [hour, minute] = alarm.time.split(':').map(Number)
    const at = new Date(now)
    at.setHours(hour, minute, 0, 0)
    if (at.getTime() <= now.getTime()) continue

    if (!best || at.getTime() < best.at) {
      best = { alarm, at: at.getTime() }
    }
  }

  return best?.alarm ?? null
}
