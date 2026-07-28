import { useEffect } from 'react'
import { startAlarmScheduler } from '../lib/alarmScheduler'
import { ensureAlarmPushReady } from '../lib/notify'
import { bootstrapAlarmDelivery } from '../lib/alarmBootstrap'
import { isNativeAlarmDevMode, syncAlarmsToNative } from '../lib/nativeAlarm'
import { markAlarmFired } from '../lib/alarmStore'

/** 앱 전체에서 사용자 알람 스케줄러 + 푸시 등록 + iOS native mock 동기화 */
export function useAlarmScheduler(): void {
  useEffect(() => {
    const stop = startAlarmScheduler()
    void bootstrapAlarmDelivery({ askPermission: false })
    void ensureAlarmPushReady()
    if (isNativeAlarmDevMode()) {
      void syncAlarmsToNative()
    }

    const onPushFired = (event: MessageEvent) => {
      const data = event.data as { type?: string; dateKey?: string; dedup?: string } | null
      if (data?.type !== 'alarm-push-fired' || !data.dedup || !data.dateKey) return
      markAlarmFired(data.dateKey, data.dedup)
    }
    navigator.serviceWorker?.addEventListener('message', onPushFired)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onPushFired)
      stop()
    }
  }, [])
}
