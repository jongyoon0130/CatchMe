/** 알람 시각 — 24h `HH:mm`, 분은 1분 단위 (목표 할 일과 달리 5분 반올림 없음) */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseAlarmTime24(value: string): { period: 'am' | 'pm'; hour12: number; minute: number } {
  const m = value.match(HHMM)
  if (!m) return { period: 'am', hour12: 7, minute: 0 }
  const hour24 = Number(m[1])
  const minute = Number(m[2])
  const period: 'am' | 'pm' = hour24 >= 12 ? 'pm' : 'am'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { period, hour12, minute }
}

export function toAlarmTime24(period: 'am' | 'pm', hour12: number, minute: number): string {
  let h = hour12 % 12
  if (period === 'pm') h += 12
  if (period === 'am' && hour12 === 12) h = 0
  const m = Math.min(59, Math.max(0, Math.round(minute)))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const ALARM_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i) as readonly number[]
export const ALARM_HOUR12_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
