import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAlarmClockTime } from '../../lib/userAlarms'
import { isDismissPhraseComplete } from '../../lib/alarmDismissPhrase'
import {
  dismissMatchProgress,
  isAwaitingNextLine,
  normalizeTypedInput,
  phraseMatchStates,
  type PhraseCharState,
} from '../../lib/alarmDismissMatch'
import { stopAlarmSoundLoop } from '../../lib/alarmSound'
import { stopNativeActiveAlarm, autoSyncAlarmsToNative } from '../../lib/nativeAlarm'
import { stopRingingAlarm, markPhraseSessionDone, type RingingAlarm } from '../../lib/alarmRingingStore'

const PHRASE_CLASS =
  'font-serif text-[18px] leading-[1.9] whitespace-pre-wrap break-words tracking-[0.01em]'

function TypingCursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[2px] h-[1.05em] bg-glow align-[-0.12em] mx-[1px] animate-pulse rounded-full"
    />
  )
}

function renderCharState(state: PhraseCharState, key: string) {
  if (state.kind === 'wrong') {
    return (
      <span key={key} className="text-status-error font-semibold">
        {state.typed}
      </span>
    )
  }
  if (state.char === '\n') return <br key={key} />

  if (state.kind === 'pending') {
    return (
      <span key={key} className="text-muted/28">
        {state.char}
      </span>
    )
  }
  if (state.kind === 'correct') {
    return (
      <span key={key} className="text-ink font-medium">
        {state.char}
      </span>
    )
  }
  return (
    <span key={key} className="text-status-error font-semibold">
      {state.char}
    </span>
  )
}

function PhraseDisplay({ phrase, typed }: { phrase: string; typed: string }) {
  const states = phraseMatchStates(phrase, typed)
  const cursorAt = states.findIndex((s) => s.kind === 'pending')

  return (
    <div className={`${PHRASE_CLASS} select-none pointer-events-none`} aria-hidden>
      {states.map((state, i) => {
        const key = `${i}-${state.kind}-${state.kind === 'wrong' ? state.typed : 'char' in state ? state.char : i}`
        const showCursor = cursorAt === i
        if (state.kind !== 'wrong' && state.char === '\n') {
          return (
            <span key={key}>
              <br />
              {showCursor ? <TypingCursor /> : null}
            </span>
          )
        }
        return (
          <span key={key}>
            {showCursor ? <TypingCursor /> : null}
            {renderCharState(state, `${key}-c`)}
          </span>
        )
      })}
      {cursorAt === -1 ? null : cursorAt === states.length ? <TypingCursor /> : null}
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
  const awaitingNextLine = isAwaitingNextLine(phrase, value)
  const lineCount = Math.max(3, phrase.split('\n').length)

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

  const handleRawInput = useCallback(
    (raw: string) => {
      onChange(normalizeTypedInput(phrase, raw))
    },
    [onChange, phrase],
  )

  const hint = !value.length
    ? '회색 글자를 그대로 따라 치세요 · Enter·스페이스 없이 이어서 입력'
    : awaitingNextLine
      ? '다음 줄 — Enter 누르지 말고 바로 이어서 치세요'
      : '틀리면 빨간색 · 줄바꿈은 자동'

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
        enterKeyHint="next"
        aria-label="다짐 문장 따라 입력"
        rows={lineCount}
        className={`absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-transparent outline-none ${PHRASE_CLASS} z-10 px-4 py-4 [-webkit-text-fill-color:transparent]`}
        autoFocus
        onChange={(e) => {
          handleRawInput(e.target.value)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionUpdate={(e) => {
          handleRawInput(e.currentTarget.value)
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          handleRawInput(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (composingRef.current) return
          if (e.key === 'Enter') {
            e.preventDefault()
            if (isAwaitingNextLine(phrase, value)) {
              handleRawInput(`${value}\n`)
            }
          }
        }}
      />

      <p
        className={`absolute bottom-3 inset-x-4 text-[11px] pointer-events-none z-0 leading-relaxed ${
          awaitingNextLine ? 'text-glow font-medium' : 'text-muted/70'
        }`}
      >
        {hint}
      </p>
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
  const { trigger, phrase, alarmKitId } = ringing

  const handleTyped = useCallback(
    (next: string) => {
      setTyped(next)
      if (isDismissPhraseComplete(phrase, next)) {
        setDone(true)
        stopAlarmSoundLoop()
        markPhraseSessionDone(trigger)
        stopRingingAlarm()
        void (async () => {
          await stopNativeActiveAlarm({ alarmId: trigger.alarmId, alarmKitId })
          await autoSyncAlarmsToNative(true)
        })()
        window.setTimeout(onDismissed, 320)
      }
    },
    [phrase, onDismissed, trigger, alarmKitId],
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
            어젯밤의 내가 정한 다짐이에요. 그대로 따라 치면 알람이 꺼져요. 줄바꿈은 Enter 없이
            이어서 치면 자동으로 넘어가요.
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
