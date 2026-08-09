import { dateKeyFrom } from '../clockAlarmEngine'
import { loadDismissPhrase } from '../alarmDismissPhrase'
import { ensureDismissPhrasesForAlarms } from '../alarmDismissPhraseEngine'
import { loadUserAlarms, type UserAlarm } from '../userAlarms'
import type { NativeAlarmRecord } from './types'
import { FutureMeAlarm, isNativeAlarmAvailable } from './plugin'
import { loadAlarmAlertMode } from '../alarmAlertMode'
import { loadAlarmSettings } from '../alarmStore'

const AUTO_SYNC_DEBOUNCE_MS = 5_000
let lastAutoSyncAt = 0
let inFlight: Promise<{ ok: boolean; count: number }> | null = null

function recordForAlarm(alarm: UserAlarm, dateKey: string): NativeAlarmRecord {
  const phrase =
    loadDismissPhrase(alarm.id, dateKey)?.phrase ??
    '오늘도 미래의 나를 선택한다'
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

/**
 * 알람 목록 → AlarmKit 울림 체인 예약.
 *
 * 네이티브가 "따라치기 대기 중인 체인"을 스스로 보호하므로,
 * 여기서는 언제 호출해도 진행 중인 재울림이 끊기지 않는다.
 */
export async function syncAlarmsToNative(): Promise<{ ok: boolean; count: number }> {
  if (!isNativeAlarmAvailable()) return { ok: true, count: 0 }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const alarms = loadUserAlarms()
      await ensureDismissPhrasesForAlarms(alarms)
      const records = loadAlarmSettings().lockScreenAlarmEnabled ? buildNativeAlarmRecords() : []
      const result = await FutureMeAlarm.syncAlarms({
        alarms: records,
        alertMode: loadAlarmAlertMode(),
      })
      lastAutoSyncAt = Date.now()
      return { ok: result.ok, count: result.count }
    } catch {
      return { ok: false, count: 0 }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * 앱 실행·포그라운드·알람 화면 진입 시 자동 동기화.
 * force=true 면 디바운스를 무시한다 (알람 저장·다짐 완료·수동 버튼).
 */
export async function autoSyncAlarmsToNative(force = false): Promise<{ ok: boolean; count: number }> {
  if (!isNativeAlarmAvailable()) return { ok: true, count: 0 }
  if (!force && Date.now() - lastAutoSyncAt < AUTO_SYNC_DEBOUNCE_MS) {
    return { ok: true, count: 0 }
  }
  return syncAlarmsToNative()
}

/** 남은 재울림이 적으면 체인을 다시 채운다 — 무한 반복 보장 */
export async function refillNativeAlarmChain(): Promise<void> {
  if (!isNativeAlarmAvailable()) return
  try {
    await FutureMeAlarm.refillChain()
  } catch {
    /* ignore */
  }
}
