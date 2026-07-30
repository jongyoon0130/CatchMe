import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './goals/goal-app.css'
import './index.css'
import './styles/aurora.css'
import './styles/brand-theme.css' /* 로컬 미리보기 — 배포 전 제거 가능 */
import { initTheme } from './lib/themes'
import { registerNotifyWorker } from './lib/notify'
import { attachNativeAlarmFiredListener, fireNativeAlarmDismissUI } from './lib/nativeAlarm'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'

initTheme()

// 알림 수신기 등록 — 실패해도 앱은 그대로 돌아간다 (알림만 못 받을 뿐)
void registerNotifyWorker()

// iOS Native(mock) / 웹 mock — alarmFired → 따라치기 오버레이
attachNativeAlarmFiredListener((event) => {
  fireNativeAlarmDismissUI(event)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
