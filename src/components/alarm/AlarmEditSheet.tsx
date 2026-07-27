import { useEffect, useState } from 'react'
import { AlarmTimePicker } from './AlarmTimePicker'
import { DOW_LABELS, type UserAlarm } from '../../lib/userAlarms'

interface Props {
  alarm: UserAlarm | null
  onSave: (draft: Pick<UserAlarm, 'time' | 'label' | 'repeatDays'>) => void
  onDelete?: () => void
  onClose: () => void
}

export function AlarmEditSheet({ alarm, onSave, onDelete, onClose }: Props) {
  const isNew = !alarm
  const [time, setTime] = useState(alarm?.time ?? '07:00')
  const [label, setLabel] = useState(alarm?.label ?? '알람')
  const [repeatDays, setRepeatDays] = useState<number[]>(alarm?.repeatDays ?? [0, 1, 2, 3, 4, 5, 6])

  useEffect(() => {
    if (!alarm) return
    setTime(alarm.time)
    setLabel(alarm.label)
    setRepeatDays(alarm.repeatDays.length ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6])
  }, [alarm])

  const toggleDay = (d: number) => {
    setRepeatDays((prev) => {
      const set = new Set(prev.length ? prev : [0, 1, 2, 3, 4, 5, 6])
      if (set.has(d)) set.delete(d)
      else set.add(d)
      const next = [...set].sort((a, b) => a - b)
      return next.length ? next : [d]
    })
  }

  const handleSave = () => {
    onSave({ time, label: label.trim() || '알람', repeatDays })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/30" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-lg rounded-t-[28px] bg-surface px-5 pt-4 pb-8 shadow-[0_-12px_40px_rgba(20,22,28,0.12)] animate-fade-up max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={isNew ? '알람 추가' : '알람 수정'}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={onClose} className="text-sm text-muted px-1 py-1">
            취소
          </button>
          <h2 className="text-[15px] font-bold text-ink">{isNew ? '알람 추가' : '알람 수정'}</h2>
          <button type="button" onClick={handleSave} className="text-sm font-bold text-ink px-1 py-1">
            저장
          </button>
        </div>

        <AlarmTimePicker time={time} onChange={setTime} />

        <div className="mt-5">
          <label className="text-[11px] text-muted mb-1.5 block">이름</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="알람"
            className="w-full rounded-xl border border-border bg-surface-2/50 px-3.5 py-3 text-[15px] text-ink focus:outline-none focus:border-ink/30"
          />
        </div>

        <div className="mt-5">
          <p className="text-[11px] text-muted mb-2">반복</p>
          <div className="flex justify-between gap-1">
            {DOW_LABELS.map((name, d) => {
              const active = (repeatDays.length ? repeatDays : [0, 1, 2, 3, 4, 5, 6]).includes(d)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                    active ? 'bg-ink text-surface' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {!isNew && onDelete ? (
          <button
            type="button"
            onClick={() => {
              onDelete()
              onClose()
            }}
            className="mt-6 w-full rounded-xl py-3 text-sm font-medium text-status-error bg-status-error/8"
          >
            알람 삭제
          </button>
        ) : null}
      </div>
    </div>
  )
}
