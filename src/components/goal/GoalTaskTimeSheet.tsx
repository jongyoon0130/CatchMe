import { useEffect, useState } from 'react'
import {
  formatTaskTimeRange,
  parseTaskTime24,
  toTaskTime24,
  type TaskTimeField,
} from '../../lib/goalTaskTime'
import { ALARM_HOUR12_OPTIONS, ALARM_MINUTE_OPTIONS } from '../../lib/alarmTime'
import { AlarmWheelColumn, WHEEL_HEIGHT } from '../alarm/AlarmWheelColumn'

interface Props {
  taskLabel: string
  timeStart?: string
  timeEnd?: string
  onSave: (next: { timeStart?: string; timeEnd?: string }) => void
  onClose: () => void
}

/** 할 일 시간 설정 — 알람 편집과 같은 1분 단위 휠 피커 */
export function GoalTaskTimeSheet({ taskLabel, timeStart, timeEnd, onSave, onClose }: Props) {
  const [field, setField] = useState<TaskTimeField>('start')
  const [start, setStart] = useState<string | undefined>(() => timeStart)
  const [end, setEnd] = useState<string | undefined>(() => timeEnd)

  const active = field === 'start' ? start : end
  const parsed = parseTaskTime24(active ?? '09:00')
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)

  useEffect(() => {
    const p = parseTaskTime24(active ?? '09:00')
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
  }, [field, active])

  const applyPicker = (p: 'am' | 'pm', h: number, m: number) => {
    const value = toTaskTime24(p, h, m)
    if (field === 'start') setStart(value)
    else setEnd(value)
  }

  /** 아이폰 시계 앱처럼 — 시 휠이 11↔12 경계를 넘으면 오전/오후가 저절로 바뀐다 */
  const handleWheelHour = (h: number) => {
    const crossed = (hour12 === 12) !== (h === 12)
    const nextPeriod = crossed ? (period === 'am' ? 'pm' : 'am') : period
    if (crossed) setPeriod(nextPeriod)
    setHour12(h)
    applyPicker(nextPeriod, h, minute)
  }

  const clearField = () => {
    if (field === 'start') setStart(undefined)
    else setEnd(undefined)
  }

  const handleDone = () => {
    onSave({ timeStart: start, timeEnd: end })
  }

  const preview = formatTaskTimeRange(start, end)

  return (
    <div className="goal-time-backdrop" onClick={onClose} role="presentation">
      <div
        className="goal-time-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="할 일 시간 설정"
      >
        <h2 className="goal-time-title">할 일 시간</h2>
        <p className="goal-time-task">{taskLabel}</p>
        {preview ? <p className="goal-time-preview">{preview}</p> : <p className="goal-time-preview muted">시간 없음</p>}

        <div className="goal-time-field-tabs">
          <button
            type="button"
            className={field === 'start' ? 'on' : ''}
            onClick={() => setField('start')}
          >
            시작
          </button>
          <button
            type="button"
            className={field === 'end' ? 'on' : ''}
            onClick={() => setField('end')}
          >
            끝
          </button>
        </div>

        <div className="goal-time-ampm">
          <button
            type="button"
            className={period === 'am' ? 'on' : ''}
            onClick={() => {
              setPeriod('am')
              applyPicker('am', hour12, minute)
            }}
          >
            오전
          </button>
          <button
            type="button"
            className={period === 'pm' ? 'on' : ''}
            onClick={() => {
              setPeriod('pm')
              applyPicker('pm', hour12, minute)
            }}
          >
            오후
          </button>
        </div>

        <div className="goal-time-wheels" style={{ minHeight: WHEEL_HEIGHT + 8 }}>
          <AlarmWheelColumn
            ariaLabel="시"
            options={ALARM_HOUR12_OPTIONS}
            value={hour12}
            onChange={handleWheelHour}
            format={(h) => String(h)}
          />
          <span className="goal-time-wheels-colon">:</span>
          <AlarmWheelColumn
            ariaLabel="분"
            options={ALARM_MINUTE_OPTIONS}
            value={minute}
            onChange={(m) => {
              setMinute(m)
              applyPicker(period, hour12, m)
            }}
            format={(m) => String(m).padStart(2, '0')}
          />
        </div>

        <div className="goal-time-actions">
          <button type="button" className="goal-time-clear" onClick={clearField}>
            {field === 'start' ? '시작 시간 비우기' : '끝 시간 비우기'}
          </button>
          <button type="button" className="goal-time-done" onClick={handleDone}>
            시간 설정 완료
          </button>
        </div>
      </div>
    </div>
  )
}
