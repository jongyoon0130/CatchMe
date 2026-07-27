import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAlarmClockTime } from '../../lib/userAlarms'
import { isDismissPhraseComplete } from '../../lib/alarmDismissPhrase'
import { stopAlarmSoundLoop } from '../../lib/alarmSound'
import { stopRingingAlarm, type RingingAlarm } from '../../lib/alarmRingingStore'

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

  const shownValue = composeText ?? value

  /** 회색/검정 표시 — 조합 중인 글자까지 즉시 반영 */
  const effective = shownValue

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const timer = window.setTimeout(() => {
      el.focus({ preventScroll: true })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [])

  const commit = useCallback(
    (raw: string): string => {
      if (phrase.startsWith(raw)) {
        onChange(raw)
        return raw
      }
      let valid = ''
      for (let i = 0; i < raw.length; i++) {
        const prefix = raw.slice(0, i + 1)
        if (phrase.startsWith(prefix)) valid = prefix
        else break
      }
      onChange(valid)
      return valid
    },
    [phrase, onChange],
  )

  const applyCompose = useCallback(
    (next: string) => {
      setComposeText(next)
      // 조합이 완성되는 순간 바로 value에 반영 (다음 글자 칠 때까지 기다리지 않음)
      if (phrase.startsWith(next)) {
        onChange(next)
      }
    },
    [phrase, onChange],
  )

  const focusInput = () => {
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div
      className="relative min-h-[12rem] cursor-text"
      onClick={focusInput}
      onPointerDown={(e) => {
        if (e.target !== inputRef.current) {
          e.preventDefault()
          focusInput()
        }
      }}
    >
      <div
        className="font-serif text-[17px] leading-[1.85] whitespace-pre-wrap break-words select-none pointer-events-none"
        aria-hidden
      >
        {phrase.split('').map((char, i) => {
          const matched = i < effective.length && effective[i] === char
          return (
            <span
              key={`${i}-${char}`}
              className={matched ? 'text-ink' : 'text-muted/30'}
            >
              {char}
            </span>
          )
        })}
      </div>
      <textarea
        ref={inputRef}
        value={shownValue}
        onChange={(e) => {
          const next = e.target.value
          if (composingRef.current) {
            applyCompose(next)
            return
          }
          const committed = commit(next)
          if (committed !== next) {
            e.target.value = committed
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true
          setComposeText(value)
        }}
        onCompositionUpdate={(e) => {
          applyCompose(e.currentTarget.value)
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          setComposeText(null)
          const committed = commit(e.currentTarget.value)
          if (e.currentTarget.value !== committed) {
            e.currentTarget.value = committed
          }
        }}
        onKeyDown={(e) => {
          if (composingRef.current) return
          if (e.key === 'Enter') {
            e.preventDefault()
            if (phrase[value.length] === '\n') {
              onChange(`${value}\n`)
            }
          }
        }}
        className="absolute inset-0 w-full min-h-full resize-none bg-transparent text-transparent caret-ink outline-none font-serif text-[17px] leading-[1.85] whitespace-pre-wrap break-words z-10"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        autoFocus
        enterKeyHint="done"
        aria-label="다짐 문장 따라 입력"
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
      className="fixed inset-0 z-[100] flex flex-col bg-void/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-dismiss-title"
    >
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto px-5 pt-10 pb-8">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-2">알람</p>
          <h1 id="alarm-dismiss-title" className="text-2xl font-serif text-ink">
            {trigger.label || '알람'}
          </h1>
          <p className="text-sm text-muted mt-1">{formatAlarmClockTime(trigger.time)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm flex-1 flex flex-col min-h-0">
          <p className="text-xs text-muted mb-4">
            전날 정해 둔 다짐을 <strong className="text-ink font-medium">오타 없이</strong> 그대로 따라
            쳐야 꺼져요.
          </p>

          <div className="flex-1 min-h-[8rem]">
            <PhraseTypeMatch phrase={phrase} value={typed} onChange={handleTyped} />
          </div>

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
