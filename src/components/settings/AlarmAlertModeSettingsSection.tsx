import { useEffect, useState } from 'react'
import { AlarmAlertModePicker } from '../alarm/AlarmAlertModePicker'
import {
  loadAlarmAlertMode,
  saveAlarmAlertMode,
  ALARM_ALERT_MODE_CHANGE,
  type AlarmAlertMode,
} from '../../lib/alarmAlertMode'
import { autoSyncAlarmsToNative } from '../../lib/nativeAlarm'

export function AlarmAlertModeSettingsSection({ onChanged }: { onChanged?: () => void }) {
  const [mode, setMode] = useState<AlarmAlertMode>(() => loadAlarmAlertMode())

  useEffect(() => {
    const onModeChange = () => setMode(loadAlarmAlertMode())
    window.addEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
    return () => window.removeEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
  }, [])

  const handleChange = (next: AlarmAlertMode) => {
    if (next === mode) return
    saveAlarmAlertMode(next)
    setMode(next)
    void autoSyncAlarmsToNative(true)
    onChanged?.()
  }

  return (
    <section className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2">알람 울림</p>
      <AlarmAlertModePicker value={mode} onChange={handleChange} className="mb-0" />
    </section>
  )
}
