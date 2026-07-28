import { useEffect, useRef, useState } from 'react'
import {
  ALARM_HOUR12_OPTIONS,
  ALARM_MINUTE_OPTIONS,
  parseAlarmTime24,
  toAlarmTime24,
} from '../../lib/alarmTime'

interface Props {
  time: string
  onChange: (time24: string) => void
}

/** 알람 편집용 — 오전/오후 + 시·분 (1분 단위) */
export function AlarmTimePicker({ time, onChange }: Props) {
  const parsed = parseAlarmTime24(time)
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)
  const minuteScrollRef = useRef<HTMLDivElement>(null)
  const minuteBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  useEffect(() => {
    const p = parseAlarmTime24(time)
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
  }, [time])

  useEffect(() => {
    const el = minuteBtnRefs.current.get(minute)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [minute])

  const apply = (p: 'am' | 'pm', h: number, m: number) => {
    onChange(toAlarmTime24(p, h, m))
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['am', 'pm'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPeriod(p)
              apply(p, hour12, minute)
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              period === p ? 'bg-ink text-surface' : 'bg-surface-2 text-ink/70'
            }`}
          >
            {p === 'am' ? '오전' : '오후'}
          </button>
        ))}
      </div>

      <div>
        <p className="text-[11px] text-muted mb-2">시</p>
        <div className="grid grid-cols-6 gap-1.5">
          {ALARM_HOUR12_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHour12(h)
                apply(period, h, minute)
              }}
              className={`rounded-lg py-2 text-sm font-medium tabular-nums ${
                hour12 === h ? 'bg-ink text-surface' : 'bg-surface-2 text-ink/80'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-muted mb-2">분 · 1분 단위</p>
        <div
          ref={minuteScrollRef}
          className="grid grid-cols-6 gap-1.5 max-h-36 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-surface-2/40 p-1.5"
        >
          {ALARM_MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              ref={(el) => {
                if (el) minuteBtnRefs.current.set(m, el)
                else minuteBtnRefs.current.delete(m)
              }}
              type="button"
              onClick={() => {
                setMinute(m)
                apply(period, hour12, m)
              }}
              className={`rounded-lg py-2 text-sm font-medium tabular-nums ${
                minute === m ? 'bg-ink text-surface shadow-sm' : 'bg-surface text-ink/80 hover:bg-surface-2'
              }`}
            >
              {String(m).padStart(2, '0')}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
