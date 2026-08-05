import { useEffect } from 'react'
import { startAlarmScheduler } from '../lib/alarmScheduler'
import { ensureAlarmPushReady } from '../lib/notify'
import { bootstrapAlarmDelivery } from '../lib/alarmBootstrap'
import { isNativeAlarmAvailable, autoSyncAlarmsToNative, consumeNativePendingDismiss } from '../lib/nativeAlarm'
import { markAlarmFired } from '../lib/alarmStore'
import { watchServiceWorkerAlarmSync } from '../lib/alarmSwSync'
import { startAlarmSoundLoop } from '../lib/alarmSound'
import { startRingingAlarm } from '../lib/alarmRingingStore'
import type { ClockAlarmTrigger } from '../lib/clockAlarmEngine'

/** 앱 전체에서 사용자 알람 스케줄러 + SW 예약 + 푸시 등록 */
export function useAlarmScheduler(): void {
  useEffect(() => {
    const stop = startAlarmScheduler()
    const stopSwWatch = watchServiceWorkerAlarmSync()
    void bootstrapAlarmDelivery({ askPermission: false })
    void ensureAlarmPushReady()
    if (isNativeAlarmAvailable()) {
      void (async () => {
        await consumeNativePendingDismiss()
        await autoSyncAlarmsToNative()
      })()
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string
        dateKey?: string
        dedup?: string
        alarmId?: string
        time?: string
        label?: string
        phrase?: string
      } | null
      if (!data?.type || !data.dedup || !data.dateKey) return

      if (data.type === 'alarm-push-fired' || data.type === 'alarm-sw-fired') {
        markAlarmFired(data.dateKey, data.dedup)
      }

      if (data.type === 'alarm-sw-fired' && data.alarmId && data.time && data.phrase) {
        const trigger: ClockAlarmTrigger = {
          alarmId: data.alarmId,
          dateKey: data.dateKey,
          time: data.time,
          label: data.label || '알람',
        }
        startRingingAlarm(trigger, data.phrase)
        startAlarmSoundLoop()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
      stopSwWatch()
      stop()
    }
  }, [])
}
