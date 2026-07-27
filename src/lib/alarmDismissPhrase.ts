import type { ClockAlarmTrigger } from './clockAlarmEngine'

export interface AlarmDismissPhrase {
  alarmId: string
  /** 알람이 울리는 날 (YYYY-MM-DD) */
  dateKey: string
  phrase: string
  generatedAt: number
  source: 'ai' | 'fallback'
}

const STORAGE_PREFIX = 'futureme-alarm-dismiss-'

function storageKey(alarmId: string, dateKey: string): string {
  return `${STORAGE_PREFIX}${alarmId}:${dateKey}`
}

export function loadDismissPhrase(alarmId: string, dateKey: string): AlarmDismissPhrase | null {
  try {
    const raw = localStorage.getItem(storageKey(alarmId, dateKey))
    if (!raw) return null
    const data = JSON.parse(raw) as AlarmDismissPhrase
    if (!data?.phrase?.trim() || data.alarmId !== alarmId || data.dateKey !== dateKey) return null
    return { ...data, phrase: normalizeDismissPhrase(data.phrase) }
  } catch {
    return null
  }
}

export function saveDismissPhrase(record: AlarmDismissPhrase): void {
  const phrase = normalizeDismissPhrase(record.phrase)
  if (!phrase) return
  localStorage.setItem(
    storageKey(record.alarmId, record.dateKey),
    JSON.stringify({ ...record, phrase }),
  )
}

/** AI·폴백 출력을 3줄 다짐 형태로 정리 */
export function normalizeDismissPhrase(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
  return lines.join('\n')
}

export function isDismissPhraseComplete(phrase: string, typed: string): boolean {
  return typed === phrase
}

export function dismissPhraseForTrigger(trigger: ClockAlarmTrigger): AlarmDismissPhrase | null {
  return loadDismissPhrase(trigger.alarmId, trigger.dateKey)
}
