import { useEffect } from 'react'
import { AlarmClockPanel } from '../alarm/AlarmClockPanel'
import { ensureAlarmPushReady } from '../../lib/notify'
import { pushLocalAlarmData } from '../../lib/alarmDataSync'
import { autoSyncAlarmsToNative, consumeNativePendingDismiss } from '../../lib/nativeAlarm'

export function AlarmScreen() {
  useEffect(() => {
    void ensureAlarmPushReady()
    void pushLocalAlarmData().catch(() => {})
    void (async () => {
      await consumeNativePendingDismiss()
      await autoSyncAlarmsToNative()
    })()
  }, [])

  return (
    <div className="h-full overflow-hidden bg-void">
      <div className="h-full max-w-lg mx-auto overflow-y-auto overscroll-y-contain px-5 pt-6 pb-28">
        <AlarmClockPanel />
      </div>
    </div>
  )
}
