import { useEffect, useRef, useState } from 'react'
import type { AlarmAlertMode } from '../../lib/alarmAlertMode'
import { AlertModePhoneIcon } from './AlarmAlertModeIcons'

const OPTIONS: { id: AlarmAlertMode; label: string }[] = [
  { id: 'sound', label: '소리' },
  { id: 'vibrate', label: '진동' },
  { id: 'silent', label: '무음' },
]

interface Props {
  value: AlarmAlertMode
  onChange: (mode: AlarmAlertMode) => void
}

export function AlarmAlertModePicker({ value, onChange }: Props) {
  const [flashLabel, setFlashLabel] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  const handleSelect = (mode: AlarmAlertMode, label: string) => {
    onChange(mode)
    setFlashLabel(label)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashLabel(null), 1100)
  }

  return (
    <div className="relative rounded-xl border border-border bg-surface px-2 py-3 mb-3">
      <div
        className={`pointer-events-none absolute inset-x-0 top-2 flex justify-center transition-opacity duration-200 ${
          flashLabel ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
      >
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-surface">
          {flashLabel ?? ''}
        </span>
      </div>

      <div className="grid grid-cols-3 w-full pt-1">
        {OPTIONS.map((opt) => {
          const active = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => handleSelect(opt.id, opt.label)}
              className="flex min-h-[52px] items-center justify-center py-2 transition-transform active:scale-95"
            >
              <AlertModePhoneIcon mode={opt.id} active={active} size={36} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
