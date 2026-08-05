import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAlarmClockTime } from '../../lib/userAlarms'
import { isDismissPhraseComplete } from '../../lib/alarmDismissPhrase'
import {
  dismissMatchProgress,
  hasWrongInput,
  isAwaitingNextLine,
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
      <span key={key} className="text-status-error font-semibold underline decoration-status-error/60 decoration-2 underline-offset-4">
        {state.typed === ' ' ? '\u00A0' : state.typed}
      </span>
    )
  }
  if (state.kind === 'extra') {
    return (
      <span key={key} className="text-status-error font-semibold underline decoration-status-error/60 decoration-2 underline-offset-4">
        {state.char === ' ' ? '\u00A0' : state.char}
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
  return (
    <span key={key} className="text-ink font-medium">
      {state.char}
    </span>
  )
}

function PhraseDisplay({ phrase, typed }: { phrase: string; typed: string }) {
  const states = phraseMatchStates(phrase, typed)
  // 커서 = 입력이 실제로 멈춘 자리: 첫 pending 앞, pending이 없으면 맨 끝
  const cursorAt = states.findIndex((s) => s.kind === 'pending')

  return (
    <div className={`${PHRASE_CLASS} select-none pointer-events-none`} aria-hidden>
      {states.map((state, i) => {
        const key = `${i}-${state.kind}`
        const showCursor = cursorAt === i
        if (state.kind !== 'wrong' && state.kind !== 'extra' && state.char === '\n') {
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
      {cursorAt === -1 && states.length > 0 ? <TypingCursor /> : null}
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
  const awaitingNextLine = isAwaitingNextLine(phrase, value)
  const wrong = hasWrongInput(phrase, value)
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

  const hint = !value.length
    ? '회색 글자를 그대로 따라 치세요 · 줄바꿈은 자동으로 넘어가요'
    : wrong
      ? '빨간 글자는 지우고(⌫) 다시 치면 돼요'
      : awaitingNextLine
        ? '이어서 다음 줄을 치면 돼요 — Enter는 안 눌러도 돼요'
        : '틀리면 빨간색 — 지우고 다시 치면 돼요'

  return (
    <div
      className="relative rounded-2xl border border-border/70 bg-surface-2/60 px-4 py-4 min-h-[11rem] cursor-text touch-manipulation"
      onClick={focusInput}
      role="group"
      aria-label="다짐 따라 입력"
    >
      <PhraseDisplay phrase={phrase} typed={value} />

      {/*
        핵심: 이 textarea의 value는 사용자가 친 그대로(raw)이며, 코드가 절대
        잘라서 되돌려 쓰지 않는다. 한글 IME는 조합 중간 상태("ㅇ"→"안")를
        거치는데, 그때 값을 재작성하면 React가 DOM을 리셋해 조합이 파괴되고
        아무것도 안 쳐지는 것처럼 보인다. 표시는 PhraseDisplay가 맡고,
        여기는 투명 입력층 역할만 한다.
      */}
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
          onChange(e.target.value)
        }}
      />

      <p
        className={`absolute bottom-3 inset-x-4 text-[11px] pointer-events-none z-0 leading-relaxed ${
          wrong ? 'text-status-error font-medium' : awaitingNextLine ? 'text-glow font-medium' : 'text-muted/70'
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
  const { trigger, alarmKitId } = ringing
  // 빈 문구면 영원히 해제 불가능해진다 — 마지막 방어선
  const phrase = ringing.phrase?.trim() ? ringing.phrase : '안녕'

  const handleTyped = useCallback(
    (next: string) => {
      if (done) return
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
    [done, phrase, onDismissed, trigger, alarmKitId],
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
            어젯밤의 내가 정한 다짐이에요. 그대로 따라 치면 알람이 꺼져요. 틀린 글자는
            지우고 다시 치면 돼요.
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
