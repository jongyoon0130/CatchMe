import { useCallback, useEffect, useState } from 'react'
import {
  addUserAlarm,
  deleteUserAlarm,
  describeRepeatDays,
  formatAlarmClockTime,
  loadUserAlarms,
  toggleUserAlarm,
  updateUserAlarm,
  USER_ALARMS_CHANGE,
  type UserAlarm,
} from '../../lib/userAlarms'
import { getNextAlarmPreview } from '../../lib/alarmScheduler'
import { loadDismissPhrase } from '../../lib/alarmDismissPhrase'
import {
  describeNotifyBlocker,
  enableAlarmNotifications,
  readNotifyEnv,
  type NotifyEnv,
} from '../../lib/notify'
import { AlarmEditSheet } from './AlarmEditSheet'

/** 핸드폰 시계 앱처럼 — 알람 목록 + 토글 + 추가 */
export function AlarmClockPanel() {
  const [alarms, setAlarms] = useState<UserAlarm[]>(() => loadUserAlarms())
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [editing, setEditing] = useState<UserAlarm | null | 'new'>(null)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [nextPhrase, setNextPhrase] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setAlarms(loadUserAlarms())
    setEnv(readNotifyEnv())
    const next = getNextAlarmPreview()
    setNextLabel(next ? `${formatAlarmClockTime(next.time)} · ${next.label}` : null)
    setNextPhrase(
      next ? loadDismissPhrase(next.alarmId, next.dateKey)?.phrase ?? null : null,
    )
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(USER_ALARMS_CHANGE, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener(USER_ALARMS_CHANGE, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [refresh])

  const blocker = describeNotifyBlocker(env)
  const needPermission = env.permission !== 'granted'

  const handleEnableNotify = async () => {
    const { permission, push } = await enableAlarmNotifications()
    refresh()
    if (permission !== 'granted') return
    if (push?.ok) {
      window.alert('알림·푸시를 켰어요. 잠금 화면에서도 알람을 받을 수 있어요.')
    } else if (push?.reason === 'no_vapid') {
      window.alert('알림은 켰어요. 서버 푸시 키가 설정되면 잠금 화면 알람도 활성화돼요.')
    }
  }

  const handleSave = (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays'>) => {
    if (editing === 'new') {
      addUserAlarm(draft)
    } else if (editing) {
      updateUserAlarm(editing.id, draft)
    }
    refresh()
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-0.035em] text-ink">알람</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-surface shadow-[0_4px_14px_rgba(20,22,28,0.18)] active:scale-[0.98]"
        >
          + 추가
        </button>
      </div>

      <p className="text-[11px] text-muted/75 mb-3 leading-relaxed">
        전날 밤 AI가 만든 다짐을 <strong className="font-medium text-ink/80">오타 없이</strong> 따라 쳐야 꺼져요.
        로그인 + 알림 허용 + (iPhone) 홈 화면 추가 시 잠금 화면에서도 알림이 와요.
      </p>

      {needPermission ? (
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/8 px-3.5 py-3 mb-3">
          <p className="text-[12px] text-ink/85 mb-2 leading-relaxed">
            {blocker ?? '알림 권한을 켜야 알람이 울려요.'}
          </p>
          {!blocker ? (
            <button
              type="button"
              onClick={() => void handleEnableNotify()}
              className="text-[12px] font-bold text-ink underline underline-offset-2"
            >
              알림 허용하기
            </button>
          ) : null}
        </div>
      ) : null}

      {nextLabel ? (
        <p className="text-[11px] text-ink/70 mb-3">
          다음 알람 · <span className="font-semibold">{nextLabel}</span>
        </p>
      ) : null}

      {nextPhrase ? (
        <div className="rounded-xl border border-border/70 bg-surface-2/50 px-3.5 py-3 mb-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">다음 알람 다짐 (미리보기)</p>
          <p className="font-serif text-[13px] leading-relaxed text-muted/80 whitespace-pre-wrap">{nextPhrase}</p>
        </div>
      ) : null}

      {alarms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-surface-2/30 px-4 py-10 text-center">
          <p className="text-sm text-muted mb-1">등록된 알람이 없어요</p>
          <p className="text-[12px] text-muted/70 mb-4">
            위 <strong className="font-medium">+ 추가</strong>로 첫 알람을 만들어보세요
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-surface"
          >
            알람 추가
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {alarms.map((alarm) => (
            <li key={alarm.id}>
              <button
                type="button"
                onClick={() => setEditing(alarm)}
                className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                  alarm.enabled
                    ? 'border-border/60 bg-surface shadow-sm'
                    : 'border-border/40 bg-surface-2/40 opacity-75'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[34px] font-light tracking-[-0.04em] leading-none tabular-nums ${
                        alarm.enabled ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {formatAlarmClockTime(alarm.time).replace(/^오전 |^오후 /, '')}
                    </p>
                    <p className="text-[11px] text-muted mt-1">
                      {formatAlarmClockTime(alarm.time).startsWith('오전') ? '오전' : '오후'} · {alarm.label}
                    </p>
                    <p className="text-[11px] text-muted/70 mt-0.5">{describeRepeatDays(alarm.repeatDays)}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alarm.enabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleUserAlarm(alarm.id, !alarm.enabled)
                      refresh()
                    }}
                    className={`relative shrink-0 h-8 w-[52px] rounded-full transition-colors ${
                      alarm.enabled ? 'bg-status-ok' : 'bg-border/80'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform ${
                        alarm.enabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <AlarmEditSheet
          alarm={editing === 'new' ? null : editing}
          onSave={handleSave}
          onDelete={
            editing !== 'new' && editing
              ? () => {
                  deleteUserAlarm(editing.id)
                  refresh()
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
