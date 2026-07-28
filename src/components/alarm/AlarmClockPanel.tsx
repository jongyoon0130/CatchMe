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
import {
  getLockScreenAlarmStatus,
  registerLockScreenAlarm,
  sendLockScreenTestPush,
  type LockScreenAlarmStatus,
} from '../../lib/alarmPushClient'
import {
  getNativeAlarmStatus,
  isNativeAlarmDevMode,
  requestNativeNotificationPermission,
  runNativeAlarmSimulation,
  scheduleNativeTestNotification,
  syncAlarmsToNative,
  type NativeAlarmStatus,
} from '../../lib/nativeAlarm'
import { activeDismissPhrase } from '../../lib/alarmDismissPhrase'
import { useAuth } from '../../contexts/AuthContext'
import { AlarmEditSheet } from './AlarmEditSheet'

/** 핸드폰 시계 앱처럼 — 알람 목록 + 토글 + 추가 */
export function AlarmClockPanel() {
  const { user } = useAuth()
  const [alarms, setAlarms] = useState<UserAlarm[]>(() => loadUserAlarms())
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [lockStatus, setLockStatus] = useState<LockScreenAlarmStatus | null>(null)
  const [editing, setEditing] = useState<UserAlarm | null | 'new'>(null)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [nextPhrase, setNextPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState<'register' | 'test' | 'native' | 'sync' | null>(null)
  const [nativeStatus, setNativeStatus] = useState<NativeAlarmStatus | null>(null)

  const refreshLockStatus = useCallback(async () => {
    setLockStatus(await getLockScreenAlarmStatus())
    if (isNativeAlarmDevMode()) {
      setNativeStatus(await getNativeAlarmStatus())
    }
  }, [])

  const refresh = useCallback(() => {
    setAlarms(loadUserAlarms())
    setEnv(readNotifyEnv())
    const next = getNextAlarmPreview()
    setNextLabel(next ? `${formatAlarmClockTime(next.time)} · ${next.label}` : null)
    setNextPhrase(
      next ? loadDismissPhrase(next.alarmId, next.dateKey)?.phrase ?? null : null,
    )
    void refreshLockStatus()
  }, [refreshLockStatus])

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

  useEffect(() => {
    if (user) void refreshLockStatus()
  }, [user, refreshLockStatus])

  const blocker = describeNotifyBlocker(env)
  const needPermission = env.permission !== 'granted'

  const handleEnableNotify = async () => {
    const { permission, push } = await enableAlarmNotifications()
    refresh()
    if (permission !== 'granted') return
    if (push?.ok) {
      window.alert('알림을 켰어요. 이제 「잠금 알람 등록」을 눌러주세요.')
    } else if (push?.reason === 'no_vapid') {
      window.alert('알림은 켰어요. 서버 푸시 키가 설정되면 잠금 화면 알람도 활성화돼요.')
    } else if (push?.reason === 'unsupported' && env.isIOS && !env.standalone) {
      window.alert('iPhone은 Safari가 아니라 홈 화면 앱으로 열어야 잠금 알람이 와요.')
    }
  }

  const handleRegisterLock = async () => {
    setBusy('register')
    try {
      const result = await registerLockScreenAlarm()
      refresh()
      window.alert(
        result.ok
          ? '잠금 화면 알람 등록 완료! 앱을 닫아도 서버에서 알림을 보내요.'
          : result.detail ?? '등록에 실패했어요.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleTestLock = async () => {
    setBusy('test')
    try {
      const result = await sendLockScreenTestPush()
      refresh()
      window.alert(
        result.ok
          ? '5초 안에 앱을 완전히 닫고 잠금 화면을 확인해주세요. 알림을 탭하면 따라치기 화면이 열려요.'
          : result.detail ?? '테스트 푸시에 실패했어요.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleNativeSync = async () => {
    setBusy('sync')
    try {
      const result = await syncAlarmsToNative()
      await refreshLockStatus()
      window.alert(result.ok ? `네이티브에 ${result.count}개 알람 동기화했어요.` : '동기화에 실패했어요.')
    } finally {
      setBusy(null)
    }
  }

  const handleNativeSimulate = async () => {
    setBusy('native')
    try {
      const result = await runNativeAlarmSimulation()
      if (!result.ok) {
        window.alert(result.detail ?? '시뮬레이션에 실패했어요.')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleNativeTestNotify = async () => {
    setBusy('native')
    try {
      const alarm = alarms[0]
      if (!alarm) {
        window.alert('먼저 알람을 추가해주세요.')
        return
      }
      const phrase = activeDismissPhrase()
      const ok = await scheduleNativeTestNotification({
        seconds: 5,
        alarmId: alarm.id,
        label: alarm.label,
        time: alarm.time,
        phrase,
      })
      window.alert(
        ok
          ? '5초 뒤 알림이 옵니다. 탭하면 따라치기 화면이 열려요. (AlarmKit 아님 — 약한 대용)'
          : '알림 권한이 필요해요.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleNativeNotifyPermission = async () => {
    const p = await requestNativeNotificationPermission()
    await refreshLockStatus()
    window.alert(p === 'granted' ? '알림을 허용했어요.' : '알림이 거부되었거나 사용할 수 없어요.')
  }

  const handleSave = (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays'>) => {
    if (editing === 'new') {
      addUserAlarm(draft)
    } else if (editing) {
      updateUserAlarm(editing.id, { ...draft, enabled: true })
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
        앱이 닫혀 있거나 잠금 상태에서는 <strong className="font-medium text-ink/80">서버 푸시</strong>로
        알림이 와요. 알림을 탭하면 따라치기 화면이 열려요.
      </p>

      <div className="rounded-xl border border-border/70 bg-surface-2/40 px-3.5 py-3 mb-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-ink">잠금 화면 알람</p>
        <ul className="text-[11px] text-muted space-y-1">
          <li>{env.standalone || !env.isIOS ? '✓' : '○'} 홈 화면 앱으로 실행</li>
          <li>{user ? '✓' : '○'} Google 로그인</li>
          <li>{env.permission === 'granted' ? '✓' : '○'} 알림 허용</li>
          <li>{lockStatus?.pushSubscription ? '✓' : '○'} 푸시 구독</li>
          <li>{lockStatus?.alarmsOnServer ? '✓' : '○'} 서버에 알람 저장</li>
        </ul>
        {lockStatus?.blocker ? (
          <p className="text-[11px] text-status-warn leading-relaxed">{lockStatus.blocker}</p>
        ) : lockStatus?.ready ? (
          <p className="text-[11px] text-status-ok">잠금 화면 알람 준비 완료</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {needPermission && !blocker ? (
            <button
              type="button"
              onClick={() => void handleEnableNotify()}
              className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface"
            >
              알림 허용하기
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleRegisterLock()}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
          >
            {busy === 'register' ? '등록 중…' : '잠금 알람 등록'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleTestLock()}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
          >
            {busy === 'test' ? '전송 중…' : '잠금 화면 테스트'}
          </button>
        </div>
      </div>

      {isNativeAlarmDevMode() ? (
        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-3.5 py-3 mb-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-ink">iOS 네이티브 알람 (개발 · Mock)</p>
          <p className="text-[11px] text-muted leading-relaxed">
            AlarmKit entitlement <strong className="font-medium text-ink/80">승인 전</strong> 테스트용입니다.
            따라치기 UX·Bridge·동기화를 확인할 수 있어요.
          </p>
          {nativeStatus ? (
            <ul className="text-[11px] text-muted space-y-1">
              <li>모드 · {nativeStatus.mode === 'mock' ? 'Mock' : nativeStatus.mode}</li>
              <li>AlarmKit · {nativeStatus.alarmKitEntitled ? '✓ 승인됨' : '○ 승인 대기'}</li>
              <li>동기화된 알람 · {nativeStatus.scheduledCount}개</li>
              <li>알림 권한 · {nativeStatus.notificationPermission}</li>
            </ul>
          ) : null}
          {nativeStatus?.message ? (
            <p className="text-[11px] text-muted/90 leading-relaxed">{nativeStatus.message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeSimulate()}
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {busy === 'native' ? '실행 중…' : '알람 울림 시뮬레이션'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeSync()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
            >
              {busy === 'sync' ? '동기화…' : '네이티브 동기화'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeTestNotify()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
            >
              5초 뒤 알림 (대용)
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeNotifyPermission()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
            >
              알림 권한
            </button>
          </div>
        </div>
      ) : null}

      {needPermission && blocker ? (
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/8 px-3.5 py-3 mb-3">
          <p className="text-[12px] text-ink/85 leading-relaxed">{blocker}</p>
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
