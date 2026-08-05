import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { App as CapApp } from '@capacitor/app'
import { AlarmDismissOverlay } from './AlarmDismissOverlay'
import { openAlarmDismissFromDeepLink } from '../../lib/alarmDeepLink'
import { consumeNativePendingDismiss, refillNativeAlarmChain } from '../../lib/nativeAlarm'
import {
  getRingingAlarm,
  loadPendingDismiss,
  startRingingAlarm,
  subscribeRingingAlarm,
} from '../../lib/alarmRingingStore'
import { startAlarmSoundLoop } from '../../lib/alarmSound'

/** 네이티브 pending 을 놓치지 않기 위한 주기 확인 간격 */
const PENDING_POLL_MS = 3_000

/** 알람이 울릴 때 전체 화면 따라치기 오버레이 */
export function AlarmDismissProvider({ children }: { children: React.ReactNode }) {
  const ringing = useSyncExternalStore(subscribeRingingAlarm, getRingingAlarm, () => null)

  /** 네이티브(AlarmKit) 가 유일한 진실 — 울리기 시작했고 다짐을 안 친 체인이 있으면 여기서 잡힌다 */
  const checkNativePending = useCallback(async () => {
    if (getRingingAlarm()) return false
    if (!(await consumeNativePendingDismiss())) return false
    startAlarmSoundLoop()
    void refillNativeAlarmChain()
    return true
  }, [])

  const restorePendingDismiss = useCallback(async () => {
    if (await checkNativePending()) return
    if (getRingingAlarm()) return
    if (await openAlarmDismissFromDeepLink()) return
    const pending = loadPendingDismiss()
    if (pending) {
      startRingingAlarm(pending.trigger, pending.phrase, pending.alarmKitId)
      startAlarmSoundLoop()
    }
  }, [checkNativePending])

  useEffect(() => {
    void restorePendingDismiss()

    let removeListener: (() => void) | null = null
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void restorePendingDismiss()
    }).then((handle) => {
      removeListener = () => handle.remove()
    })

    // 앱이 열려 있는 동안 알람이 울리는 경우까지 확실히 잡는다
    const timer = window.setInterval(() => {
      void checkNativePending()
    }, PENDING_POLL_MS)

    return () => {
      window.clearInterval(timer)
      removeListener?.()
    }
  }, [restorePendingDismiss, checkNativePending])

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
