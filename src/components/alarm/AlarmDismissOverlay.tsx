import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAlarmClockTime } from '../../lib/userAlarms'
import { isDismissPhraseComplete } from '../../lib/alarmDismissPhrase'
import { commitTypedPrefix } from '../../lib/alarmDismissMatch'
import { stopAlarmSoundLoop } from '../../lib/alarmSound'
import { stopRingingAlarm, type RingingAlarm } from '../../lib/alarmRingingStore'

function useMobileTyping(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setMobile(coarse || ios)
  }, [])
  return mobile
}

function PhraseTypeMatch({
  phrase,
  value,
  onChange,
}: {
  phrase: string
  value: string
  onChange: (next: string) => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const [composeText, setComposeText] = useState<string | null>(null)
  const mobile = useMobileTyping()

  const shownValue = composeText ?? value
  const effective = shownValue

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const timer = window.setTimeout(() => {
      el.focus({ preventScroll: true })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [])

  const commit = useCallback(
    (raw: string): string => {
      const next = commitTypedPrefix(phrase, raw)
      onChange(next)
      return next
    },
    [phrase, onChange],
  )

  const applyCompose = useCallback(
    (next: string) => {
      setComposeText(next)
      if (phrase.startsWith(next)) onChange(next)
    },
    [phrase, onChange],
  )

  const focusInput = () => {
    inputRef.current?.focus({ preventScroll: true })
  }

  const ghost = (
    <div
      className="font-serif text-[17px] leading-[1.85] whitespace-pre-wrap break-words select-none pointer-events-none"
      aria-hidden
    >
      {phrase.split('').map((char, i) => {
        const matched = i < effective.length && effective[i] === char
        return (
          <span key={`${i}-${char}`} className={matched ? 'text-ink' : 'text-muted/30'}>
            {char}
          </span>
        )
      })}
    </div>
  )

  const sharedInputProps = {
    ref: inputRef,
    value: shownValue,
    lang: 'ko' as const,
    inputMode: 'text' as const,
    spellCheck: false,
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    enterKeyHint: 'done' as const,
    'aria-label': '다짐 문장 따라 입력',
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value
      if (composingRef.current) {
        applyCompose(next)
        return
      }
      const committed = commit(next)
      if (committed !== next) e.target.value = committed
    },
    onCompositionStart: () => {
      composingRef.current = true
      setComposeText(value)
    },
    onCompositionUpdate: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      applyCompose(e.currentTarget.value)
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false
      setComposeText(null)
      const committed = commit(e.currentTarget.value)
      if (e.currentTarget.value !== committed) e.currentTarget.value = committed
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (phrase[value.length] === '\n') onChange(`${value}\n`)
      }
    },
  }

  if (mobile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="relative">{ghost}</div>
        <textarea
          {...sharedInputProps}
          rows={3}
          placeholder="여기에 따라 입력하세요"
          className="w-full min-h-[5.5rem] resize-none rounded-xl border border-border bg-surface-2/80 px-3.5 py-3 font-serif text-[17px] leading-[1.85] text-ink outline-none focus:border-ink/30 focus:ring-2 focus:ring-glow/25"
          autoFocus
        />
        <p className="text-[11px] text-muted">키보드가 안 뜨면 위 입력칸을 한 번 탭해 주세요.</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-[12rem] cursor-text" onClick={focusInput}>
      {ghost}
      <textarea
        {...sharedInputProps}
        className="absolute inset-0 w-full min-h-full resize-none bg-transparent text-transparent caret-ink outline-none font-serif text-[17px] leading-[1.85] whitespace-pre-wrap break-words z-10 [-webkit-text-fill-color:transparent]"
        autoFocus
      />
    </div>
  )
}

export function AlarmDismissOverlay({
  ringing,
  onDismissed,
}: {
  ringing: RingingAlarm
  onDismissed: () => void
}) {
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)
  const { trigger, phrase } = ringing

  const handleTyped = useCallback(
    (next: string) => {
      setTyped(next)
      if (isDismissPhraseComplete(phrase, next)) {
        setDone(true)
        stopAlarmSoundLoop()
        stopRingingAlarm()
        window.setTimeout(onDismissed, 320)
      }
    },
    [phrase, onDismissed],
  )

  const progress = phrase.length ? Math.round((typed.length / phrase.length) * 100) : 0

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-void/95 backdrop-blur-md overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-dismiss-title"
    >
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto px-5 pt-10 pb-8 overflow-y-auto">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-2">알람</p>
          <h1 id="alarm-dismiss-title" className="text-2xl font-serif text-ink">
            {trigger.label || '알람'}
          </h1>
          <p className="text-sm text-muted mt-1">{formatAlarmClockTime(trigger.time)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm flex flex-col">
          <p className="text-xs text-muted mb-4">
            전날 정해 둔 다짐을 <strong className="text-ink font-medium">오타 없이</strong> 그대로 따라
            쳐야 꺼져요.
          </p>

          <PhraseTypeMatch phrase={phrase} value={typed} onChange={handleTyped} />

          <div className="mt-5 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
              <span>진행</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-glow transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {done && (
          <p className="text-center text-sm text-status-ok mt-4" role="status">
            잘 했어요. 좋은 하루 시작해요.
          </p>
        )}
      </div>
    </div>
  )
}
