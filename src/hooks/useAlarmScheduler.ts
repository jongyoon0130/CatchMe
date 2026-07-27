import { useEffect } from 'react'
import { startAlarmScheduler } from '../lib/alarmScheduler'

/** 앱 전체에서 할 일 시간 알람 스케줄러를 돌린다 */
export function useAlarmScheduler(): void {
  useEffect(() => startAlarmScheduler(), [])
}
