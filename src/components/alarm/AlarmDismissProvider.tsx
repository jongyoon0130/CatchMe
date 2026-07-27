import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { AlarmDismissOverlay } from './AlarmDismissOverlay'
import {
  getRingingAlarm,
  loadPendingDismiss,
  startRingingAlarm,
  subscribeRingingAlarm,
} from '../../lib/alarmRingingStore'
import { startAlarmSoundLoop } from '../../lib/alarmSound'

/** 알람이 울릴 때 전체 화면 따라치기 오버레이 */
export function AlarmDismissProvider({ children }: { children: React.ReactNode }) {
  const ringing = useSyncExternalStore(subscribeRingingAlarm, getRingingAlarm, () => null)

  useEffect(() => {
    const pending = loadPendingDismiss()
    if (pending && !getRingingAlarm()) {
      startRingingAlarm(pending.trigger, pending.phrase)
      startAlarmSoundLoop()
    }
  }, [])

  const handleDismissed = useCallback(() => {
    /* store cleared in overlay */
  }, [])

  return (
    <>
      {children}
      {ringing && <AlarmDismissOverlay ringing={ringing} onDismissed={handleDismissed} />}
    </>
  )
}
