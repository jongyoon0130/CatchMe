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
import { ensureDismissPhrasesForAlarms, resolveDismissPhraseSync } from '../../lib/alarmDismissPhraseEngine'
import { dateKeyFrom } from '../../lib/clockAlarmEngine'
import {
  describeNotifyBlocker,
  enableAlarmNotifications,
  readNotifyEnv,
  type NotifyEnv,
} from '../../lib/notify'
import { bootstrapAlarmDelivery } from '../../lib/alarmBootstrap'
import { getLockScreenAlarmStatus, registerLockScreenAlarm, sendLockScreenTestPush } from '../../lib/alarmPushClient'
import {
  getNativeAlarmStatus,
  isNativeAlarmDevMode,
  requestNativeNotificationPermission,
  runNativeAlarmSimulation,
  scheduleNativeTestNotification,
  cancelNativePendingAlarms,
  autoSyncAlarmsToNative,
  getNativeAlarmDebugInfo,
  type NativeAlarmDebugInfo,
  type NativeAlarmStatus,
} from '../../lib/nativeAlarm'
import {
  loadAlarmAlertMode,
  saveAlarmAlertMode,
  describeAlarmAlertMode,
  ALARM_ALERT_MODE_CHANGE,
  type AlarmAlertMode,
} from '../../lib/alarmAlertMode'
import { useAuth } from '../../contexts/AuthContext'
import { AlarmEditSheet } from './AlarmEditSheet'

/** 핸드폰 시계 앱처럼 — 알람 목록 + 토글 + 추가 */
export function AlarmClockPanel() {
  const { user } = useAuth()
  const [alarms, setAlarms] = useState<UserAlarm[]>(() => loadUserAlarms())
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [deliveryReady, setDeliveryReady] = useState(false)
  const [deliveryBlocker, setDeliveryBlocker] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserAlarm | null | 'new'>(null)
  const [nextLabel, setNextLabel] = useState<string | null>(null)
  const [nextPhrase, setNextPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'test' | 'native' | 'sync' | null>(null)
  const [nativeStatus, setNativeStatus] = useState<NativeAlarmStatus | null>(null)
  const [debugInfo, setDebugInfo] = useState<NativeAlarmDebugInfo | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [alertMode, setAlertMode] = useState<AlarmAlertMode>(() => loadAlarmAlertMode())

  const ALERT_MODE_OPTIONS: { id: AlarmAlertMode; label: string }[] = [
    { id: 'vibrate', label: '진동만' },
    { id: 'silent', label: '무음' },
    { id: 'sound', label: '소리 + 진동' },
  ]

  const refresh = useCallback(() => {
    setAlarms(loadUserAlarms())
    setEnv(readNotifyEnv())
    void getLockScreenAlarmStatus().then((status) => {
      setDeliveryBlocker(status.blocker)
      setDeliveryReady(status.ready)
    })
    const next = getNextAlarmPreview()
    setNextLabel(next ? `${formatAlarmClockTime(next.time)} · ${next.label}` : null)
    if (next) {
      const stored = loadDismissPhrase(next.alarmId, next.dateKey)?.phrase
      if (stored) {
        setNextPhrase(stored)
      } else {
        setNextPhrase(
          resolveDismissPhraseSync({
            alarmId: next.alarmId,
            dateKey: next.dateKey,
            alarmLabel: next.label,
          }),
        )
        void ensureDismissPhrasesForAlarms(loadUserAlarms()).then(() => {
          const generated = loadDismissPhrase(next.alarmId, next.dateKey)?.phrase
          if (generated) setNextPhrase(generated)
        })
      }
    } else {
      setNextPhrase(null)
    }
    if (isNativeAlarmDevMode()) {
      void getNativeAlarmStatus().then(setNativeStatus)
      void getNativeAlarmDebugInfo().then(setDebugInfo)
    }
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

  useEffect(() => {
    const onModeChange = () => setAlertMode(loadAlarmAlertMode())
    window.addEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
    return () => window.removeEventListener(ALARM_ALERT_MODE_CHANGE, onModeChange)
  }, [])

  useEffect(() => {
    void bootstrapAlarmDelivery({ askPermission: false, forceRenew: true })
  }, [alarms, user])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void bootstrapAlarmDelivery({ askPermission: false, forceRenew: false })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const blocker = describeNotifyBlocker(env)
  const needPermission = env.permission !== 'granted'

  const handleEnableNotify = async () => {
    const { permission } = await enableAlarmNotifications()
    await bootstrapAlarmDelivery({ askPermission: false, forceRenew: true })
    refresh()
    if (permission !== 'granted') return
    window.alert('알림을 켰어요. 설정한 시간에 자동으로 울려요.')
  }

  const handleConnectPush = async () => {
    setBusy('connect')
    try {
      const result = await registerLockScreenAlarm()
      refresh()
      window.alert(result.ok ? '서버 연결 완료! 이제 앱을 꺼도 알람이 와요.' : result.detail ?? '연결에 실패했어요.')
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
      const result = await autoSyncAlarmsToNative(true)
      refresh()
      window.alert(
        result.ok
          ? `${result.count}개 알람 예약 완료. 알람 1건마다 20초 간격 재울림이 미리 예약돼요.`
          : '동기화에 실패했어요. 알람 권한을 확인해주세요.',
      )
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
      await ensureDismissPhrasesForAlarms([alarm])
      const dateKey = dateKeyFrom(new Date())
      const phrase =
        loadDismissPhrase(alarm.id, dateKey)?.phrase ??
        resolveDismissPhraseSync({
          alarmId: alarm.id,
          dateKey,
          alarmLabel: alarm.label,
        })
      const result = await scheduleNativeTestNotification({
        seconds: 5,
        alarmId: alarm.id,
        label: alarm.label,
        time: alarm.time,
        phrase,
        alertMode: loadAlarmAlertMode(),
      })
      if (!result.ok) {
        window.alert(result.detail ?? 'AlarmKit 알람 권한이 필요해요.')
        return
      }
      refresh()
      window.alert(
        `5초 뒤 첫 울림 · 20초 간격으로 ${result.ringCount ?? 0}회 미리 예약했어요.\n\n` +
          `푸시 ${result.pushCount ?? 0}개도 같이 예약됐어요.\n` +
          `앱을 완전히 종료해도 다짐을 따라 칠 때까지 계속 울려요.`,
      )
    } finally {
      setBusy(null)
    }
  }

  const handleNativeCancelPending = async () => {
    setBusy('native')
    try {
      const ok = await cancelNativePendingAlarms()
      await autoSyncAlarmsToNative(true)
      refresh()
      window.alert(
        ok
          ? '예약된 알람·푸시를 모두 지우고, 실제 알람을 다시 등록했어요.'
          : '초기화에 실패했어요. 앱을 다시 실행해주세요.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleNativeNotifyPermission = async () => {
    const p = await requestNativeNotificationPermission()
    await getNativeAlarmStatus().then(setNativeStatus)
    window.alert(p === 'granted' ? 'AlarmKit 알람을 허용했어요.' : '알람이 거부되었거나 사용할 수 없어요.')
  }

  const handleAlertModeChange = (mode: AlarmAlertMode) => {
    if (mode === alertMode) return
    saveAlarmAlertMode(mode)
    setAlertMode(mode)
    void autoSyncAlarmsToNative(true)
  }

  const handleSave = (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays' | 'resolve'>) => {
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
          className="nb-btn nb-btn--accent rounded-full px-4 py-2 text-[13px] active:scale-100"
        >
          + 추가
        </button>
      </div>

      <p className="text-[11px] text-muted/75 mb-3 leading-relaxed">
        알람을 켜두면 <strong className="font-medium text-ink/80">설정한 시간</strong>에 울려요.
        앱을 닫거나 잠금 화면이어도 알림으로 와요.
      </p>

      <div className="rounded-xl border border-border bg-surface px-3.5 py-3 mb-3">
        <p className="text-[11px] font-semibold text-ink mb-1">알람 울림 방식</p>
        <p className="text-[10px] text-muted mb-2.5 leading-relaxed">
          현재 · {describeAlarmAlertMode(alertMode)}. 앱 안에서는 이 설정대로 울려요.
          {alertMode !== 'sound'
            ? ' 잠금 화면 AlarmKit은 iOS 제한으로 완전 무음은 어렵고, 진동 위주로 동작해요. 설정 변경 후 「지금 다시 동기화」를 눌러주세요.'
            : ' 설정 변경 후 「지금 다시 동기화」를 눌러주세요.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {ALERT_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleAlertModeChange(opt.id)}
              className={
                alertMode === opt.id
                  ? 'rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface'
                  : 'rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-muted'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {deliveryBlocker ? (
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/8 px-3.5 py-3 mb-3 space-y-2">
          <p className="text-[12px] text-ink/85 leading-relaxed">{deliveryBlocker}</p>
          <div className="flex flex-wrap gap-2">
            {needPermission && !blocker ? (
              <button
                type="button"
                onClick={() => void handleEnableNotify()}
                className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface"
              >
                알림 허용하기
              </button>
            ) : null}
            {env.permission === 'granted' && user && !deliveryReady && alarms.some((a) => a.enabled) ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleConnectPush()}
                className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface disabled:opacity-50"
              >
                {busy === 'connect' ? '연결 중…' : '연결하기'}
              </button>
            ) : null}
          </div>
        </div>
      ) : alarms.some((a) => a.enabled) && deliveryReady ? (
        <p className="text-[11px] text-status-ok mb-3">알람 준비 완료 — 앱을 꺼도 설정한 시간에 울려요</p>
      ) : null}

      {alarms.some((a) => a.enabled) && env.permission === 'granted' ? (
        <div className="mb-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleTestLock()}
            className="text-[11px] font-medium text-muted underline underline-offset-2 disabled:opacity-50"
          >
            {busy === 'test' ? '전송 중…' : '잠금 화면 알림 테스트'}
          </button>
        </div>
      ) : null}

      {isNativeAlarmDevMode() ? (
        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-3.5 py-3 mb-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-ink">iOS AlarmKit 알람</p>
          <p className="text-[11px] text-muted leading-relaxed">
            알람 1건마다 <strong className="font-medium text-ink/80">20초 간격 울림 20회</strong>를 미리
            예약해요. 앱을 완전히 종료해도 다짐을 따라 칠 때까지 계속 울립니다.
          </p>
          {nativeStatus ? (
            <ul className="text-[11px] text-muted space-y-1">
              <li>모드 · {nativeStatus.mode === 'alarmkit' ? 'AlarmKit' : nativeStatus.mode}</li>
              <li>AlarmKit 허용 · {nativeStatus.alarmKitEntitled ? '✓' : '○ (아래 권한 버튼)'}</li>
              <li>푸시 권한 · {nativeStatus.notificationPermission}</li>
              <li>등록된 알람 · {nativeStatus.scheduledCount}개</li>
              <li>AlarmKit 예약 슬롯 · {nativeStatus.alarmKitScheduledCount ?? 0}개</li>
              <li>따라치기 대기 · {nativeStatus.hasAwaitingPhrase ? '있음' : '없음'}</li>
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
              {busy === 'sync' ? '동기화…' : '지금 다시 동기화'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeTestNotify()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
            >
              {busy === 'test' ? '예약 중…' : '5초 뒤 AlarmKit 테스트'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeCancelPending()}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 disabled:opacity-50"
            >
              {busy === 'native' ? '취소 중…' : '예약 알람·푸시 지우기'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleNativeNotifyPermission()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-ink disabled:opacity-50"
            >
              알람 권한 (AlarmKit)
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDebug((v) => !v)
                void getNativeAlarmDebugInfo().then(setDebugInfo)
              }}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-muted"
            >
              {showDebug ? '진단 닫기' : '진단 보기'}
            </button>
          </div>

          {showDebug ? (
            <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-surface px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                예약된 울림 체인
              </p>
              {debugInfo?.plans.length ? (
                <ul className="space-y-1.5">
                  {debugInfo.plans.map((plan) => (
                    <li key={plan.alarmId} className="text-[10px] leading-relaxed text-muted">
                      <span className="font-semibold text-ink/80">
                        {plan.label} · {plan.time}
                      </span>
                      {plan.isTest ? ' (테스트)' : ''}
                      <br />
                      첫 울림 {plan.firstFireAt} · 남은 울림 {plan.ringsRemaining}/{plan.ringsTotal} ·
                      AlarmKit 실제 {plan.liveInAlarmKit}개
                      <br />
                      {plan.completed
                        ? '다짐 완료 — 정지됨'
                        : plan.awaitingPhrase
                          ? '따라치기 대기 중 (재울림 진행)'
                          : '대기 중'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-muted">
                  예약된 체인이 없어요. 「지금 다시 동기화」를 눌러주세요.
                </p>
              )}
              <p className="text-[10px] text-muted/80">
                대기 중인 푸시 {debugInfo?.pendingPushCount ?? 0}개
              </p>
              <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                최근 기록
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[9.5px] leading-[1.5] text-muted/90">
                {debugInfo?.log.join('\n') || '기록 없음'}
              </pre>
            </div>
          ) : null}
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
        <div className="nb-card nb-card--soft rounded-xl px-3.5 py-3 mb-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-2">다음 알람 다짐 (미리보기)</p>
          <p className="font-serif text-[13px] leading-relaxed text-muted/80 whitespace-pre-wrap">{nextPhrase}</p>
        </div>
      ) : null}

      {alarms.length === 0 ? (
        <div className="nb-card nb-card--soft rounded-2xl px-4 py-10 text-center">
          <p className="text-sm text-muted mb-1">등록된 알람이 없어요</p>
          <p className="text-[12px] text-muted/70 mb-4">
            위 <strong className="font-medium">+ 추가</strong>로 첫 알람을 만들어보세요
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="nb-btn nb-btn--accent rounded-full px-5 py-2.5 text-sm"
          >
            알람 추가
          </button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {alarms.map((alarm) => (
            <li key={alarm.id}>
              <button
                type="button"
                onClick={() => setEditing(alarm)}
                className={`nb-card nb-card-interactive w-full rounded-2xl px-4 py-3.5 text-left transition-transform ${
                  alarm.enabled ? '' : 'nb-card--soft opacity-75'
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
