import { useEffect, useState } from 'react'
import {
  ALARM_HOUR12_OPTIONS,
  ALARM_MINUTE_OPTIONS,
  parseAlarmTime24,
  toAlarmTime24,
} from '../../lib/alarmTime'
import { AlarmWheelColumn, WHEEL_HEIGHT } from './AlarmWheelColumn'

interface Props {
  time: string
  onChange: (time24: string) => void
}

function clampHour12(raw: string): number {
  const n = Number(raw.replace(/\D/g, ''))
  if (!Number.isFinite(n) || n < 1) return 1
  if (n > 12) return 12
  return n
}

function clampMinute(raw: string): number {
  const n = Number(raw.replace(/\D/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 59) return 59
  return n
}

/** 알람 편집용 — 오전/오후 + 시·분 휠 + 직접 입력 */
export function AlarmTimePicker({ time, onChange }: Props) {
  const parsed = parseAlarmTime24(time)
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)
  const [hourDraft, setHourDraft] = useState(String(parsed.hour12))
  const [minuteDraft, setMinuteDraft] = useState(String(parsed.minute).padStart(2, '0'))

  useEffect(() => {
    const p = parseAlarmTime24(time)
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
    setHourDraft(String(p.hour12))
    setMinuteDraft(String(p.minute).padStart(2, '0'))
  }, [time])

  const apply = (p: 'am' | 'pm', h: number, m: number) => {
    onChange(toAlarmTime24(p, h, m))
  }

  const commitHourDraft = () => {
    const h = clampHour12(hourDraft)
    setHour12(h)
    setHourDraft(String(h))
    apply(period, h, minute)
  }

  const commitMinuteDraft = () => {
    const m = clampMinute(minuteDraft)
    setMinute(m)
    setMinuteDraft(String(m).padStart(2, '0'))
    apply(period, hour12, m)
  }

  return (
    <div className="space-y-4">
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

      <div
        className="flex items-center justify-center gap-1.5 overflow-x-hidden"
        aria-label="시간 직접 입력"
      >
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          aria-label="시"
          value={hourDraft}
          onChange={(e) => setHourDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={commitHourDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitHourDraft()
            }
          }}
          className="w-14 rounded-xl border border-border bg-surface-2/50 py-2 text-center text-[22px] font-light tabular-nums text-ink focus:outline-none focus:border-ink/30"
        />
        <span className="text-2xl font-light text-muted/60">:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          aria-label="분"
          value={minuteDraft}
          onChange={(e) => setMinuteDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={commitMinuteDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitMinuteDraft()
            }
          }}
          className="w-14 rounded-xl border border-border bg-surface-2/50 py-2 text-center text-[22px] font-light tabular-nums text-ink focus:outline-none focus:border-ink/30"
        />
      </div>

      <div
        className="flex items-center gap-1 rounded-2xl border border-border/70 bg-surface-2/30 px-2 py-1 overflow-hidden"
        style={{ minHeight: WHEEL_HEIGHT + 8 }}
      >
        <AlarmWheelColumn
          ariaLabel="시"
          options={ALARM_HOUR12_OPTIONS}
          value={hour12}
          onChange={(h) => {
            setHour12(h)
            setHourDraft(String(h))
            apply(period, h, minute)
          }}
          format={(h) => String(h)}
        />
        <span className="text-2xl font-light text-muted/60 pb-1 shrink-0 select-none">:</span>
        <AlarmWheelColumn
          ariaLabel="분"
          options={ALARM_MINUTE_OPTIONS}
          value={minute}
          onChange={(m) => {
            setMinute(m)
            setMinuteDraft(String(m).padStart(2, '0'))
            apply(period, hour12, m)
          }}
          format={(m) => String(m).padStart(2, '0')}
        />
      </div>
    </div>
  )
}
