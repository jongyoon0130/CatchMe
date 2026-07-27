import { useEffect, useState } from 'react'
import {
  parseTaskTime24,
  TASK_HOUR12_OPTIONS,
  TASK_MINUTE_OPTIONS,
  toTaskTime24,
} from '../../lib/goalTaskTime'

interface Props {
  time: string
  onChange: (time24: string) => void
}

/** 알람 편집용 — 오전/오후 + 시·분 칩 */
export function AlarmTimePicker({ time, onChange }: Props) {
  const parsed = parseTaskTime24(time)
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)

  useEffect(() => {
    const p = parseTaskTime24(time)
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
  }, [time])

  const apply = (p: 'am' | 'pm', h: number, m: number) => {
    onChange(toTaskTime24(p, h, m))
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
          {TASK_HOUR12_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHour12(h)
                apply(period, h, minute)
              }}
              className={`rounded-lg py-2 text-sm font-medium ${
                hour12 === h ? 'bg-ink text-surface' : 'bg-surface-2 text-ink/80'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-muted mb-2">분</p>
        <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto">
          {TASK_MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinute(m)
                apply(period, hour12, m)
              }}
              className={`rounded-lg py-2 text-sm font-medium ${
                minute === m ? 'bg-ink text-surface' : 'bg-surface-2 text-ink/80'
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
