import type { ClockAlarmTrigger } from './clockAlarmEngine'
import { phraseFullyMatched } from './alarmDismissMatch'

export interface AlarmDismissPhrase {
  alarmId: string
  /** 알람이 울리는 날 (YYYY-MM-DD) */
  dateKey: string
  phrase: string
  generatedAt: number
  source: 'ai' | 'fallback' | 'manual'
}

const STORAGE_PREFIX = 'futureme-alarm-dismiss-'

/**
 * 알람 단위 "고정 문구"의 dateKey.
 * 직접 쓴 다짐(또는 AI 버튼으로 새로 만든 다짐)은 날짜가 아니라 알람에 붙어서,
 * 날짜가 바뀌거나 알람을 다시 저장해도 사용자가 바꾸기 전까지 그대로 유지된다.
 */
export const PINNED_DATE_KEY = 'pinned'

function storageKey(alarmId: string, dateKey: string): string {
  return `${STORAGE_PREFIX}${alarmId}:${dateKey}`
}

function readRecord(alarmId: string, dateKey: string): AlarmDismissPhrase | null {
  try {
    const raw = localStorage.getItem(storageKey(alarmId, dateKey))
    if (!raw) return null
    const data = JSON.parse(raw) as AlarmDismissPhrase
    if (!data?.phrase?.trim() || !data.alarmId || !data.dateKey) return null
    return { ...data, phrase: normalizeDismissPhrase(data.phrase) }
  } catch {
    return null
  }
}

export function phraseRecordKey(alarmId: string, dateKey: string): string {
  return `${alarmId}:${dateKey}`
}

/** AI·폴백 출력을 3~4줄 다짐 형태로 정리 */
export function normalizeDismissPhrase(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[\s\-*•\d.]+/, '').trim())
    .filter(Boolean)
    .slice(0, 4)
  return lines.join('\n')
}

export function loadDismissPhrase(alarmId: string, dateKey: string): AlarmDismissPhrase | null {
  // 고정 문구(직접 작성·AI 버튼)가 있으면 날짜별 자동 생성 문구보다 항상 우선한다.
  const pinned = readRecord(alarmId, PINNED_DATE_KEY)
  if (pinned) return pinned
  return readRecord(alarmId, dateKey)
}

export function saveDismissPhrase(record: AlarmDismissPhrase): void {
  const phrase = normalizeDismissPhrase(record.phrase)
  if (!phrase) return
  localStorage.setItem(
    storageKey(record.alarmId, record.dateKey),
    JSON.stringify({ ...record, phrase }),
  )
  void import('./alarmDataSync').then(({ scheduleAlarmDataSync }) => scheduleAlarmDataSync())
  void import('./nativeAlarm').then(({ isNativeAlarmAvailable, autoSyncAlarmsToNative }) => {
    if (isNativeAlarmAvailable()) void autoSyncAlarmsToNative(true)
  })
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

export function describeDismissPhraseSource(source: AlarmDismissPhrase['source']): string {
  switch (source) {
    case 'manual':
      return '직접 작성'
    case 'ai':
      return 'AI 생성'
    default:
      return '자동 생성'
  }
}

export function saveManualDismissPhrase(opts: {
  alarmId: string
  dateKey: string
  phrase: string
}): AlarmDismissPhrase | null {
  const phrase = normalizeDismissPhrase(opts.phrase)
  if (!phrase.trim()) return null
  // 날짜가 아니라 알람에 고정 — 다음 날에도, 알람을 다시 저장해도 유지된다
  const record: AlarmDismissPhrase = {
    alarmId: opts.alarmId,
    dateKey: PINNED_DATE_KEY,
    phrase,
    generatedAt: Date.now(),
    source: 'manual',
  }
  saveDismissPhrase(record)
  return record
}

export function isDismissPhraseComplete(phrase: string, typed: string): boolean {
  return phraseFullyMatched(phrase, typed)
}

export function dismissPhraseForTrigger(trigger: ClockAlarmTrigger): AlarmDismissPhrase | null {
  return loadDismissPhrase(trigger.alarmId, trigger.dateKey)
}
