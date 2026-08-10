import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MiniCalendar } from './GoalShell'

interface Props {
  initialDate: Date
  onConfirm: (date: Date) => void
  onClose: () => void
}

export function GoalChangeDateSheet({ initialDate, onConfirm, onClose }: Props) {
  const seed = useMemo(() => new Date(initialDate), [initialDate])
  const [year, setYear] = useState(seed.getFullYear())
  const [month, setMonth] = useState(seed.getMonth())
  const [day, setDay] = useState(seed.getDate())

  const handleMonthChange = (nextYear: number, nextMonth: number) => {
    setYear(nextYear)
    setMonth(nextMonth)
    const dim = new Date(nextYear, nextMonth + 1, 0).getDate()
    setDay((d) => Math.min(d, dim))
  }

  const jumpToToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setDay(now.getDate())
  }

  const handleConfirm = () => {
    onConfirm(new Date(year, month, day, 12, 0, 0, 0))
  }

  const sheet = (
    <div className="goal-app goal-time-backdrop" onClick={onClose} role="presentation">
      <div
        className="goal-change-date-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="날짜 바꾸기"
      >
        <h2 className="goal-change-date-title">날짜 바꾸기</h2>
        <MiniCalendar
          year={year}
          month={month}
          selectedDay={day}
          onSelectDay={setDay}
          onMonthChange={handleMonthChange}
          onJumpToday={jumpToToday}
        />
        <button type="button" className="goal-change-date-confirm" onClick={handleConfirm}>
          확인
        </button>
      </div>
    </div>
  )

  return createPortal(sheet, document.body)
}
