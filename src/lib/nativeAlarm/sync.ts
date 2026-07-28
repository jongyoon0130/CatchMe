import { dateKeyFrom } from '../clockAlarmEngine'
import { activeDismissPhrase, loadDismissPhrase } from '../alarmDismissPhrase'
import { loadUserAlarms, type UserAlarm } from '../userAlarms'
import type { NativeAlarmRecord } from './types'
import { FutureMeAlarm, isNativeAlarmDevMode } from './plugin'

function recordForAlarm(alarm: UserAlarm, dateKey: string): NativeAlarmRecord {
  const phrase = loadDismissPhrase(alarm.id, dateKey)?.phrase ?? activeDismissPhrase()
  return {
    id: alarm.id,
    time: alarm.time,
    label: alarm.label,
    enabled: alarm.enabled,
    repeatDays: alarm.repeatDays,
    phrase,
  }
}

export function buildNativeAlarmRecords(now = new Date()): NativeAlarmRecord[] {
  const dateKey = dateKeyFrom(now)
  return loadUserAlarms().map((alarm) => recordForAlarm(alarm, dateKey))
}

/** 알람 저장·변경 시 iOS Native(mock)에 동기화 */
export async function syncAlarmsToNative(): Promise<{ ok: boolean; count: number }> {
  if (!isNativeAlarmDevMode()) return { ok: true, count: 0 }
  const alarms = buildNativeAlarmRecords()
  try {
    const result = await FutureMeAlarm.syncAlarms({ alarms })
    return { ok: result.ok, count: result.count }
  } catch {
    return { ok: false, count: 0 }
  }
}
