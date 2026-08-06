/** 일간 할 일 시간 — 내부 저장은 24h `HH:mm`, UI 표시도 동일 */

export type TaskTimeField = 'start' | 'end'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTaskTime(value: string | undefined | null): value is string {
  return !!value?.trim() && HHMM.test(value.trim())
}

export function normalizeTaskTime(value: string | undefined | null): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  return isValidTaskTime(v) ? v : undefined
}

/** `14:30` → `{ period: 'pm', hour12: 2, minute: 30 }` */
export function parseTaskTime24(value: string): { period: 'am' | 'pm'; hour12: number; minute: number } {
  const m = value.match(HHMM)
  if (!m) return { period: 'am', hour12: 9, minute: 0 }
  const hour24 = Number(m[1])
  const minute = Number(m[2])
  const period: 'am' | 'pm' = hour24 >= 12 ? 'pm' : 'am'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  // 1분 단위 그대로 — 알람 피커와 동일 (예전엔 5분 반올림했었다)
  return { period, hour12, minute }
}

export function toTaskTime24(period: 'am' | 'pm', hour12: number, minute: number): string {
  let h = hour12 % 12
  if (period === 'pm') h += 12
  if (period === 'am' && hour12 === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatTaskTimeRange(timeStart?: string, timeEnd?: string): string | null {
  const s = normalizeTaskTime(timeStart)
  const e = normalizeTaskTime(timeEnd)
  if (!s && !e) return null
  if (s && e) return `${s} ~ ${e}`
  if (s) return `${s} ~`
  return `~ ${e}`
}

export function compareTaskTime(a?: string, b?: string): number {
  const ta = normalizeTaskTime(a) ?? '99:99'
  const tb = normalizeTaskTime(b) ?? '99:99'
  return ta.localeCompare(tb)
}

