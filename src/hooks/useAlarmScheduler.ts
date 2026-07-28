import { useEffect } from 'react'
import { startAlarmScheduler } from '../lib/alarmScheduler'
import { ensureAlarmPushReady } from '../lib/notify'

/** 앱 전체에서 사용자 알람 스케줄러 + 푸시 등록을 돌린다 */
export function useAlarmScheduler(): void {
  useEffect(() => {
    const stop = startAlarmScheduler()
    void ensureAlarmPushReady()
    return stop
  }, [])
}
