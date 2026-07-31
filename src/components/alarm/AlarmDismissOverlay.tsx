import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAlarmClockTime } from '../../lib/userAlarms'
import { isDismissPhraseComplete } from '../../lib/alarmDismissPhrase'
import { dismissMatchProgress, phraseMatchStates } from '../../lib/alarmDismissMatch'
import { stopAlarmSoundLoop } from '../../lib/alarmSound'
import { stopRingingAlarm, type RingingAlarm } from '../../lib/alarmRingingStore'

const PHRASE_CLASS =
  'font-serif text-[18px] leading-[1.9] whitespace-pre-wrap break-words tracking-[0.01em]'

function PhraseDisplay({ phrase, typed }: { phrase: string; typed: string }) {
  const states = phraseMatchStates(phrase, typed)

  return (
    <div className={`${PHRASE_CLASS} select-none pointer-events-none`} aria-hidden>
      {states.map((state, i) => {
        if (state.kind === 'pending') {
          return (
            <span key={i} className="text-muted/28">
              {state.char}
            </span>
          )
        }
        if (state.kind === 'correct') {
          return (
            <span key={i} className="text-ink font-medium">
              {state.char}
            </span>
          )
        }
        if (state.kind === 'wrong') {
          return (
            <span key={i} className="text-status-error font-semibold">
              {state.typed}
            </span>
          )
        }
        return (
          <span key={i} className="text-status-error font-semibold">
            {state.char}
          </span>
        )
      })}
    </div>
  )
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

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const timer = window.setTimeout(() => {
      el.focus({ preventScroll: true })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [])

  const focusInput = () => {
    inputRef.current?.focus({ preventScroll: true })
  }

  const handleInput = useCallback(
    (next: string) => {
      onChange(next)
    },
    [onChange],
  )

  return (
    <div
      className="relative rounded-2xl border border-border/70 bg-surface-2/60 px-4 py-4 min-h-[11rem] cursor-text touch-manipulation"
      onClick={focusInput}
      role="group"
      aria-label="다짐 따라 입력"
    >
      <PhraseDisplay phrase={phrase} typed={value} />

      <textarea
        ref={inputRef}
        value={value}
        lang="ko"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        enterKeyHint="done"
        aria-label="다짐 문장 따라 입력"
        rows={Math.max(3, phrase.split('\n').length)}
        className={`absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-ink outline-none ${PHRASE_CLASS} z-10 px-4 py-4 [-webkit-text-fill-color:transparent]`}
        autoFocus
        onChange={(e) => {
          handleInput(e.target.value)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionUpdate={(e) => {
          handleInput(e.currentTarget.value)
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          handleInput(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (composingRef.current) return
          if (e.key === 'Enter') {
            e.preventDefault()
            if (phrase[value.length] === '\n') handleInput(`${value}\n`)
          }
        }}
      />

      {!value.length ? (
        <p className="absolute bottom-3 inset-x-4 text-[11px] text-muted/70 pointer-events-none z-0">
          탭해서 회색 문장을 따라 입력하세요 · 틀리면 빨간색
        </p>
      ) : null}
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

  const progress = dismissMatchProgress(phrase, typed)
  const timeLabel = formatAlarmClockTime(trigger.time)

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-void overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-dismiss-title"
    >
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto px-5 pt-12 pb-10 overflow-y-auto">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-3">알람</p>
          <h1
            id="alarm-dismiss-title"
            className="text-[28px] font-extrabold tracking-[-0.035em] text-ink leading-tight"
          >
            {trigger.label || '알람'}
          </h1>
          <p className="text-[40px] font-light tracking-[-0.04em] text-ink tabular-nums leading-none mt-3">
            {timeLabel.replace(/^오전 |^오후 /, '')}
          </p>
          <p className="text-[12px] text-muted mt-2">
            {timeLabel.startsWith('오전') ? '오전' : '오후'} · 맞게 칠수록 진하게, 틀리면 빨간색
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface p-5 shadow-[0_8px_28px_rgba(20,22,28,0.06)] flex flex-col">
          <p className="text-[12px] text-muted mb-4 leading-relaxed">
            어젯밤의 내가 정한 다짐이에요. 그대로 따라 치면 알람이 꺼져요.
          </p>

          <PhraseTypeMatch phrase={phrase} value={typed} onChange={handleTyped} />

          <div className="mt-5 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
              <span>진행</span>
              <span className="tabular-nums font-medium text-ink/70">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-glow transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {done ? (
          <p className="text-center text-sm text-status-ok font-medium mt-5" role="status">
            잘 했어요. 좋은 하루 시작해요.
          </p>
        ) : null}
      </div>
    </div>
  )
}
