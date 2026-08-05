import { loadAlarmSettings, loadFiredAlarmKeys } from './alarmStore'
import { loadDismissPhrase } from './alarmDismissPhrase'
import { resolveDismissPhraseSync } from './alarmDismissPhraseEngine'
import { loadUserAlarms } from './userAlarms'
import { readyNotifyWorker } from './notify'
import { dateKeyFrom } from './clockAlarmEngine'

function phraseForServiceWorker(): string {
  const dateKey = dateKeyFrom(new Date())
  const alarms = loadUserAlarms().filter((a) => a.enabled)
  for (const alarm of alarms) {
    const stored = loadDismissPhrase(alarm.id, dateKey)
    if (stored?.phrase) return stored.phrase
  }
  const first = alarms[0]
  if (first) {
    return resolveDismissPhraseSync({
      alarmId: first.id,
      dateKey,
      alarmLabel: first.label,
    })
  }
  return '오늘도 미래의 나를 선택한다'
}

/** 메인 앱 → 서비스 워커: 백그라운드에서도 알람이 울리도록 예약 */
export async function syncAlarmsToServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const reg = await readyNotifyWorker()
  const worker = reg?.active ?? navigator.serviceWorker.controller
  if (!worker) return

  const dateKey = dateKeyFrom(new Date())
  const phrase = phraseForServiceWorker()

  worker.postMessage({
    type: 'sync-alarms',
    alarms: loadUserAlarms(),
    settings: loadAlarmSettings(),
    phrase,
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
