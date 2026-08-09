import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './goals/goal-app.css'
import './index.css'
import './styles/aurora.css'
import './styles/spray-theme.css' /* 로컬 미리보기 — 배포 전 제거 가능 */
import { initTheme } from './lib/themes'
import { registerNotifyWorker } from './lib/notify'
import { App as CapApp } from '@capacitor/app'
import { attachNativeAlarmFiredListener, consumeNativePendingDismiss, fireNativeAlarmDismissUI, autoSyncAlarmsToNative } from './lib/nativeAlarm'
import { loadAlarmAlertMode } from './lib/alarmAlertMode'
import { setNativeAlarmAlertMode } from './lib/nativeAlarm/plugin'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import { AlarmDismissProvider } from './components/alarm/AlarmDismissProvider'

initTheme()

// 알림 수신기 등록 — 실패해도 앱은 그대로 돌아간다 (알림만 못 받을 뿐)
void registerNotifyWorker()

// iOS Native(mock) / 웹 mock — alarmFired → 따라치기 오버레이
attachNativeAlarmFiredListener((event) => {
  fireNativeAlarmDismissUI(event)
})

void (async () => {
  void setNativeAlarmAlertMode(loadAlarmAlertMode())
  await consumeNativePendingDismiss()
  await autoSyncAlarmsToNative()
})()

void CapApp.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) return
  void (async () => {
    await consumeNativePendingDismiss()
    await autoSyncAlarmsToNative()
  })()
})
void CapApp.addListener('appUrlOpen', ({ url }) => {
  if (!url.includes('alarm-dismiss') && !url.includes('alarm=1')) return
  void consumeNativePendingDismiss()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppSettingsProvider>
        <AlarmDismissProvider>
          <App />
        </AlarmDismissProvider>
      </AppSettingsProvider>
    </AuthProvider>
  </StrictMode>,
)
