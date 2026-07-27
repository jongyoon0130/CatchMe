import { useCallback, useEffect, useState } from 'react'
import {
  describeNotifyBlocker,
  readNotifyEnv,
  requestNotifyPermission,
  showAlarmNotification,
  showTestNotification,
  type NotifyEnv,
} from '../../lib/notify'
import { playAlarmSound } from '../../lib/alarmSound'
import { Button } from '../ui'

/** 알림 권한·테스트 — 알람 목록은 AlarmClockPanel */
export function NotifySettings() {
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(() => setEnv(readNotifyEnv()), [])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  const blocker = describeNotifyBlocker(env)
  const canTest = env.permission === 'granted' && !blocker

  const handleEnable = async () => {
    setBusy(true)
    setMessage(null)
    const result = await requestNotifyPermission()
    refresh()
    setBusy(false)
    if (result === 'granted') setMessage('알림을 켰어.')
    else if (result === 'denied') setMessage('거절됐어. 기기 설정에서 알림을 허용해야 해.')
    else if (result === 'unsupported') setMessage('이 브라우저는 알림을 지원하지 않아.')
  }

  const handlePreviewAlarm = async () => {
    setBusy(true)
    playAlarmSound()
    const result = await showAlarmNotification({
      title: '알람',
      body: '미리듣기 — 설정한 시간에 이렇게 울려요.',
      tag: 'futureme-alarm-preview',
    })
    setBusy(false)
    setMessage(result.ok ? '소리 + 알림을 보냈어.' : '소리는 났을 거야. 알림 권한을 확인해줘.')
  }

  return (
    <div className="pt-2 border-t border-border/40">
      <p className="text-[11px] text-muted mb-2">알림 테스트</p>
      {blocker ? <p className="text-[11px] text-status-warn mb-2">{blocker}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={handleEnable} disabled={busy || env.permission === 'granted' || !!blocker}>
          {env.permission === 'granted' ? '알림 켜짐' : '알림 켜기'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void showTestNotification(3000)} disabled={busy || !canTest}>
          3초 테스트
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void handlePreviewAlarm()} disabled={busy || !canTest}>
          알람 소리
        </Button>
      </div>
      {message ? <p className="text-[11px] text-muted mt-2">{message}</p> : null}
    </div>
  )
}
