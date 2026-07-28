import { dateKeyFrom, userAlarmActiveOnDate } from './clockAlarmEngine'
import {
  activeDismissPhrase,
  loadDismissPhrase,
  saveDismissPhrase,
  type AlarmDismissPhrase,
} from './alarmDismissPhrase'
import type { UserAlarm } from './userAlarms'

export async function generateDismissPhraseWithAI(opts: {
  alarmId: string
  dateKey: string
  alarmLabel: string
}): Promise<AlarmDismissPhrase> {
  const record: AlarmDismissPhrase = {
    alarmId: opts.alarmId,
    dateKey: opts.dateKey,
    phrase: activeDismissPhrase(),
    generatedAt: Date.now(),
    source: 'fallback',
  }
  saveDismissPhrase(record)
  return record
}

/** 오늘·내일 알람용 다짐 문장이 없으면 미리 만든다 (전날 밤 준비 포함) */
export async function ensureDismissPhrasesForAlarms(alarms: UserAlarm[], now = new Date()): Promise<void> {
  for (let offset = 0; offset <= 1; offset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    for (const alarm of alarms) {
      if (!userAlarmActiveOnDate(alarm, day)) continue
      const dateKey = dateKeyFrom(day)
      if (loadDismissPhrase(alarm.id, dateKey)) continue
      await generateDismissPhraseWithAI({
        alarmId: alarm.id,
        dateKey,
        alarmLabel: alarm.label,
      })
    }
  }
}
