import { useEffect } from 'react'
import { startAlarmScheduler } from '../lib/alarmScheduler'
import { ensureAlarmPushReady } from '../lib/notify'
import { isNativeAlarmDevMode, syncAlarmsToNative } from '../lib/nativeAlarm'

/** 앱 전체에서 사용자 알람 스케줄러 + 푸시 등록 + iOS native mock 동기화 */
export function useAlarmScheduler(): void {
  useEffect(() => {
    const stop = startAlarmScheduler()
    void ensureAlarmPushReady()
    if (isNativeAlarmDevMode()) {
      void syncAlarmsToNative()
    }
    return stop
  }, [])
}
