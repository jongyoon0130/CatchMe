import { TaskReminderNotifyControls } from './TaskReminderNotifyControls'

/**
 * 채팅 설정 안의 알림 블록 — 알람 설정과 같은 컴포넌트를 씀.
 */
export function NotifySettings() {
  return (
    <div>
      <p className="text-xs text-muted mb-1">알림</p>
      <TaskReminderNotifyControls showDiagnostics />
    </div>
  )
}
