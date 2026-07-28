import type { ClockAlarmTrigger } from '../clockAlarmEngine'
import { activeDismissPhrase } from '../alarmDismissPhrase'
import { startAlarmSoundLoop } from '../alarmSound'
import { startRingingAlarm } from '../alarmRingingStore'
import { loadUserAlarms } from '../userAlarms'
import type { NativeAlarmFiredEvent } from './types'
import { simulateNativeAlarmFire } from './plugin'

export function nativeEventToTrigger(event: NativeAlarmFiredEvent): ClockAlarmTrigger {
  return {
    alarmId: event.alarmId.split(':')[0] ?? event.alarmId,
    label: event.label,
    time: event.time,
    dateKey: event.dateKey,
  }
}

/** 따라치기 오버레이 + 소리 (웹 mock·iOS mock 공통) */
export function fireNativeAlarmDismissUI(event: NativeAlarmFiredEvent): void {
  const trigger = nativeEventToTrigger(event)
  const phrase = event.phrase?.trim() || activeDismissPhrase()
  startRingingAlarm(trigger, phrase)
  startAlarmSoundLoop()
}

/** 개발용 — 첫 번째(또는 지정) 알람으로 울림 시뮬레이션 */
export async function runNativeAlarmSimulation(alarmId?: string): Promise<{
  ok: boolean
  detail?: string
}> {
  const alarms = loadUserAlarms()
  const alarm = (alarmId ? alarms.find((a) => a.id === alarmId) : null) ?? alarms[0]
  if (!alarm) {
    return { ok: false, detail: '등록된 알람이 없어요. 먼저 알람을 추가해주세요.' }
  }

  const payload = {
    alarmId: alarm.id,
    label: alarm.label,
    time: alarm.time,
    phrase: activeDismissPhrase(),
  }

  const ok = await simulateNativeAlarmFire(payload)
  if (!ok) {
    fireNativeAlarmDismissUI({
      ...payload,
      dateKey: new Date().toISOString().slice(0, 10),
      source: 'fallback',
    })
    return { ok: true, detail: '플러그인 없이 로컬 시뮬레이션으로 실행했어요.' }
  }

  return { ok: true }
}
