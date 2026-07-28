import type { ClockAlarmTrigger } from './clockAlarmEngine'
import { phraseFullyMatched } from './alarmDismissMatch'

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

export function phraseRecordKey(alarmId: string, dateKey: string): string {
  return `${alarmId}:${dateKey}`
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
  void import('./alarmDataSync').then(({ scheduleAlarmDataSync }) => scheduleAlarmDataSync())
}

export function loadAllDismissPhrases(): AlarmDismissPhrase[] {
  const out: AlarmDismissPhrase[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw) as AlarmDismissPhrase
      if (!data?.phrase?.trim() || !data.alarmId || !data.dateKey) continue
      out.push({ ...data, phrase: normalizeDismissPhrase(data.phrase) })
    }
  } catch {
    /* ignore */
  }
  return out
}

export function applyDismissPhrases(records: AlarmDismissPhrase[]): void {
  for (const record of records) {
    saveDismissPhrase(record)
  }
}

export function isDismissPhraseComplete(phrase: string, typed: string): boolean {
  return phraseFullyMatched(phrase, typed)
}

export function dismissPhraseForTrigger(trigger: ClockAlarmTrigger): AlarmDismissPhrase | null {
  return loadDismissPhrase(trigger.alarmId, trigger.dateKey)
}
