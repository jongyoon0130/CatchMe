import { useCallback, useEffect, useState } from 'react'
import {
  describeNotifyBlocker,
  describePushSubscribeResult,
  pushServiceHost,
  readNotifyEnv,
  readPushSubscription,
  readVapidPublicKey,
  requestNotifyPermission,
  showTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  type NotifyEnv,
} from '../../lib/notify'
import {
  deletePushSubscription,
  describePushSaveResult,
  getPushEnabled,
  isPushSubscriptionSaved,
  savePushSubscription,
  setPushEnabled,
} from '../../lib/pushSubscriptions'
import { describePushSendResult, requestServerPush } from '../../lib/pushSend'
import { registerLockScreenAlarm } from '../../lib/alarmPushClient'
import { Button } from '../ui'

interface Props {
  /** 부모(알람 설정 시트 등) 상태 갱신 */
  onChanged?: () => void
  /** 알람 설정 시트 스타일 */
  variant?: 'default' | 'sheet'
  /** 진단·테스트 접이식 표시 */
  showDiagnostics?: boolean
}

/**
 * 할 일 시간 알림(푸시) 켜기/끄기.
 * 알람 설정·채팅 설정 양쪽에서 공통으로 씀.
 */
export function TaskReminderNotifyControls({
  onChanged,
  variant = 'default',
  showDiagnostics = true,
}: Props) {
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const hasVapidKey = readVapidPublicKey() !== null
  const sheet = variant === 'sheet'

  const refreshEnv = useCallback(() => setEnv(readNotifyEnv()), [])

  const refreshSubscription = useCallback(async () => {
    const sub = await readPushSubscription()
    setEndpoint(sub?.endpoint ?? null)
    if (sub) {
      setSaved(await isPushSubscriptionSaved(sub.endpoint))
      setEnabled(await getPushEnabled(sub.endpoint))
    } else {
      setSaved(false)
      setEnabled(null)
    }
  }, [])

  const refresh = useCallback(async () => {
    refreshEnv()
    await refreshSubscription()
  }, [refreshEnv, refreshSubscription])

  useEffect(() => {
    void refreshSubscription()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh, refreshSubscription])

  const blocker = describeNotifyBlocker(env)
  const canTest = env.permission === 'granted' && !blocker
  const canTurnOn = !blocker && env.supportsPush && hasVapidKey
  const isOn = saved && enabled === true

  const handleTurnOn = async () => {
    setBusy(true)
    setMessage(null)

    if (env.permission !== 'granted') {
      const perm = await requestNotifyPermission()
      refreshEnv()
      if (perm !== 'granted') {
        setBusy(false)
        setMessage(
          perm === 'denied'
            ? '알림이 거절됐어. iPhone 설정 → Future Me → 알림에서 허용한 뒤 다시 켜줘.'
            : '이 기기는 알림을 지원하지 않아.',
        )
        return
      }
    }

    setMessage('알림을 켜는 중…')
    const result = await subscribeToPush()
    if (!result.ok) {
      setBusy(false)
      setEndpoint(null)
      setSaved(false)
      setEnabled(null)
      setMessage(describePushSubscribeResult(result))
      return
    }
    setEndpoint(result.endpoint ?? null)

    const sub = await readPushSubscription()
    const save = sub
      ? await savePushSubscription(sub)
      : ({ ok: false, reason: 'failed', detail: '주소를 다시 읽지 못했어' } as const)

    if (save.ok) {
      await registerLockScreenAlarm().catch(() => {})
    }

    setBusy(false)
    setSaved(save.ok)
    setEnabled(save.ok ? true : null)
    setMessage(
      save.ok
        ? '알림을 켰어. 시간을 적어둔 할 일에 그 시각 알림이 와.'
        : describePushSaveResult(save),
    )
    if (save.ok) onChanged?.()
  }

  const handleToggleDevice = async () => {
    if (!endpoint || enabled === null) return
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    const ok = await setPushEnabled(endpoint, next)
    setBusy(false)
    if (!ok) {
      setEnabled(!next)
      setMessage('설정을 저장하지 못했어. 잠시 뒤 다시 시도해줘.')
    } else {
      setMessage(next ? '이 기기 알림을 켰어.' : '이 기기 알림을 껐어. 다시 켤 수 있어.')
      onChanged?.()
    }
  }

  const handleTest = async () => {
    setBusy(true)
    setMessage('5초 뒤에 알림이 떠. 앱을 열어둔 채로 기다려줘.')
    const result = await showTestNotification(5000)
    setBusy(false)
    if (result.ok) setMessage('테스트 알림을 보냈어. 안 떴으면 기기 알림 설정을 확인해줘.')
    else if (result.reason === 'denied') setMessage('먼저 알림을 켜야 해.')
    else setMessage(`실패했어${result.detail ? ` (${result.detail})` : ''}`)
  }

  const handleServerPush = async () => {
    setBusy(true)
    setMessage('서버에 부탁하는 중…')
    const result = await requestServerPush()
    setBusy(false)
    setMessage(describePushSendResult(result))
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    if (endpoint) await deletePushSubscription(endpoint)
    const dropped = await unsubscribeFromPush()
    setBusy(false)
    setEndpoint(null)
    setSaved(false)
    setEnabled(null)
    setMessage(dropped ? '주소를 버렸어. "알림 켜기"를 누르면 새로 받아.' : '버릴 주소가 없었어.')
    onChanged?.()
  }

  const primaryBtnClass = sheet
    ? 'w-full rounded-xl bg-ink py-3 text-sm font-bold text-surface disabled:opacity-50'
    : undefined
  const secondaryBtnClass = sheet
    ? 'w-full rounded-xl border border-border bg-surface py-3 text-sm font-bold text-ink disabled:opacity-50'
    : undefined

  return (
    <div className={sheet ? 'rounded-xl border border-border/70 bg-surface-2/30 px-3.5 py-3.5 mb-4' : undefined}>
      <p className={`font-semibold text-ink ${sheet ? 'text-[13px]' : 'text-xs'} mb-0.5`}>할 일 알림</p>
      <p className={`text-muted leading-relaxed mb-3 ${sheet ? 'text-[11px]' : 'text-[11px]'}`}>
        홈에서 시간을 적어둔 할 일에, 그 시각이 되면 푸시 알림을 보내줘. 앱이 꺼져 있어도 와.
      </p>

      {env.isIOS && !env.standalone ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
          아이폰은 <strong className="font-medium">공유 → 홈 화면에 추가</strong>로 설치한 뒤,
          그 아이콘으로 열어야 알림을 켤 수 있어.
        </p>
      ) : blocker ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">{blocker}</p>
      ) : !hasVapidKey ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
          알림 키가 아직 앱에 들어가 있지 않아요. 앱을 다시 설치하거나 개발자에게 문의해주세요.
        </p>
      ) : isOn ? (
        <div
          className={`flex items-center justify-between ${sheet ? 'gap-3' : 'rounded-lg border border-border/40 bg-surface/40 px-3 py-2 mb-1'}`}
        >
          <span className={`${sheet ? 'text-[12px]' : 'text-xs'} text-ink/80`}>
            이 기기 알림 <span className="text-status-ok">켜짐</span>
          </span>
          {sheet ? (
            <button
              type="button"
              onClick={() => void handleToggleDevice()}
              disabled={busy}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted disabled:opacity-50"
            >
              끄기
            </button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleToggleDevice} disabled={busy}>
              끄기
            </Button>
          )}
        </div>
      ) : saved && enabled === false ? (
        <div
          className={`flex items-center justify-between ${sheet ? 'gap-3' : 'rounded-lg border border-border/40 bg-surface/40 px-3 py-2 mb-1'}`}
        >
          <span className={`${sheet ? 'text-[12px]' : 'text-xs'} text-muted`}>이 기기 알림 꺼짐</span>
          {sheet ? (
            <button
              type="button"
              onClick={() => void handleToggleDevice()}
              disabled={busy}
              className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-surface disabled:opacity-50"
            >
              켜기
            </button>
          ) : (
            <Button size="sm" variant="primary" onClick={handleToggleDevice} disabled={busy}>
              켜기
            </Button>
          )}
        </div>
      ) : sheet ? (
        <button
          type="button"
          onClick={() => void handleTurnOn()}
          disabled={busy || !canTurnOn}
          className={primaryBtnClass}
        >
          {busy ? '켜는 중…' : '할 일 알림 켜기'}
        </button>
      ) : (
        <Button size="sm" variant="primary" onClick={handleTurnOn} disabled={busy || !canTurnOn}>
          알림 켜기
        </Button>
      )}

      {message ? (
        <p className="text-[11px] text-muted mt-2 leading-relaxed whitespace-pre-line">{message}</p>
      ) : null}

      {showDiagnostics ? (
        <details className="mt-3 group">
          <summary className="text-[11px] text-muted/70 cursor-pointer select-none list-none hover:text-muted">
            문제가 있나요? <span className="text-muted/50">(진단·테스트)</span>
          </summary>

          <div className="mt-2 space-y-1">
            <CheckLine ok={env.standalone} label="홈 화면 / 앱으로 열림" hint={env.isIOS ? '아이폰은 필수' : '선택'} />
            <CheckLine ok={env.permission === 'granted'} label="알림 권한" hint={env.permission} />
            <CheckLine ok={env.supportsServiceWorker} label="알림 수신기(서비스 워커)" />
            <CheckLine ok={env.supportsPush} label="서버 알림 지원" hint="브라우저 기능만 확인" />
            <CheckLine
              ok={endpoint !== null}
              label="푸시 주소 발급됨"
              hint={endpoint ? pushServiceHost(endpoint) : '아직 안 받음'}
            />
            <CheckLine ok={saved} label="서버에 저장됨" hint={saved ? '서버가 이 기기를 앎' : '알림 켜면 저장됨'} />
          </div>

          <div className="flex flex-wrap gap-2 mt-2.5">
            {sheet ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={busy || !canTest}
                  className={secondaryBtnClass}
                  style={{ width: 'auto' }}
                >
                  5초 뒤 테스트
                </button>
                {saved ? (
                  <button
                    type="button"
                    onClick={() => void handleServerPush()}
                    disabled={busy}
                    className={secondaryBtnClass}
                    style={{ width: 'auto' }}
                  >
                    서버 테스트
                  </button>
                ) : null}
                {endpoint ? (
                  <button
                    type="button"
                    onClick={() => void handleUnsubscribe()}
                    disabled={busy}
                    className={secondaryBtnClass}
                    style={{ width: 'auto' }}
                  >
                    주소 버리기
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={handleTest} disabled={busy || !canTest}>
                  5초 뒤 테스트 알림
                </Button>
                {saved ? (
                  <Button size="sm" variant="secondary" onClick={handleServerPush} disabled={busy}>
                    서버에서 보내보기
                  </Button>
                ) : null}
                {endpoint ? (
                  <Button size="sm" variant="secondary" onClick={handleUnsubscribe} disabled={busy}>
                    주소 버리기
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {endpoint ? (
            <p className="text-[10px] text-muted/60 mt-2 leading-relaxed break-all font-mono">
              {endpoint.slice(0, 72)}
              {endpoint.length > 72 ? '…' : ''}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}

function CheckLine({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={ok ? 'text-status-ok' : 'text-muted/50'}>{ok ? '●' : '○'}</span>
      <span className={ok ? 'text-ink/80' : 'text-muted'}>{label}</span>
      {hint ? <span className="text-muted/50">· {hint}</span> : null}
    </div>
  )
}
