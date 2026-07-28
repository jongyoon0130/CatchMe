import { loadAlarmSettings, loadFiredAlarmKeys } from './alarmStore'
import { activeDismissPhrase } from './alarmDismissPhrase'
import { loadUserAlarms } from './userAlarms'
import { readyNotifyWorker } from './notify'
import { dateKeyFrom } from './clockAlarmEngine'

/** 메인 앱 → 서비스 워커: 백그라운드에서도 알람이 울리도록 예약 */
export async function syncAlarmsToServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const reg = await readyNotifyWorker()
  const worker = reg?.active ?? navigator.serviceWorker.controller
  if (!worker) return

  const dateKey = dateKeyFrom(new Date())
  worker.postMessage({
    type: 'sync-alarms',
    alarms: loadUserAlarms(),
    settings: loadAlarmSettings(),
    phrase: activeDismissPhrase(),
    firedKeys: [...loadFiredAlarmKeys(dateKey)],
  })
}

export function markAlarmFiredInServiceWorker(dedup: string): void {
  const worker = navigator.serviceWorker?.controller
  worker?.postMessage({ type: 'mark-alarm-fired', dedup })
}

export function watchServiceWorkerAlarmSync(): () => void {
  if (typeof document === 'undefined') return () => {}

  const sync = () => {
    void syncAlarmsToServiceWorker()
  }

  sync()

  const onHide = () => {
    if (document.visibilityState === 'hidden') sync()
  }

  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', sync)

  return () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', sync)
  }
}
