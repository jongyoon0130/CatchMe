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

/** 알람 편집용 — 오전/오후 + 시·분 휠 (1분 단위, 00~59 전체) */
export function AlarmTimePicker({ time, onChange }: Props) {
  const parsed = parseAlarmTime24(time)
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)

  useEffect(() => {
    const p = parseAlarmTime24(time)
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
  }, [time])

  const apply = (p: 'am' | 'pm', h: number, m: number) => {
    onChange(toAlarmTime24(p, h, m))
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

      <div>
        <p className="text-[11px] text-muted mb-2 text-center">시 · 분 (1분 단위, 아래로 스크롤)</p>
        <div
          className="flex items-center gap-1 rounded-2xl border border-border/70 bg-surface-2/30 px-2 py-1"
          style={{ minHeight: WHEEL_HEIGHT + 8 }}
        >
          <AlarmWheelColumn
            ariaLabel="시"
            options={ALARM_HOUR12_OPTIONS}
            value={hour12}
            onChange={(h) => {
              setHour12(h)
              apply(period, h, minute)
            }}
            format={(h) => String(h)}
          />
          <span className="text-2xl font-light text-muted/60 pb-1 shrink-0">:</span>
          <AlarmWheelColumn
            ariaLabel="분"
            options={ALARM_MINUTE_OPTIONS}
            value={minute}
            onChange={(m) => {
              setMinute(m)
              apply(period, hour12, m)
            }}
            format={(m) => String(m).padStart(2, '0')}
          />
        </div>
      </div>
    </div>
  )
}
