import { useEffect, useRef, useState } from 'react'
import type { AlarmAlertMode } from '../../lib/alarmAlertMode'
import { previewAlarmAlertMode } from '../../lib/alarmSound'
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
  const [flashMode, setFlashMode] = useState<AlarmAlertMode | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  const handleSelect = (mode: AlarmAlertMode) => {
    onChange(mode)
    // 고른 순간에만 해당 모드 그대로 피드백 — 소리면 한 번 울리고, 진동이면 짧게 떨림
    previewAlarmAlertMode(mode)
    setFlashMode(mode)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashMode(null), 1100)
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-2 pt-1.5 pb-2.5 mb-3">
      <div className="grid grid-cols-3 w-full">
        {OPTIONS.map((opt) => {
          const active = value === opt.id
          const flashed = flashMode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => handleSelect(opt.id)}
              className="flex flex-col items-center justify-end gap-1 pb-1 transition-transform active:scale-95"
            >
              {/* 라벨은 각자 자기 아이콘 바로 위에 뜬다 */}
              <span
                className={`h-[22px] flex items-end transition-opacity duration-200 ${
                  flashed ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden={!flashed}
              >
                <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-surface">
                  {opt.label}
                </span>
              </span>
              <AlertModePhoneIcon mode={opt.id} active={active} size={36} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
