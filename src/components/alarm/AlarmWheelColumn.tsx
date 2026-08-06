import { useCallback, useEffect, useRef } from 'react'

const ITEM_H = 44
const VISIBLE_ROWS = 5
export const WHEEL_HEIGHT = ITEM_H * VISIBLE_ROWS
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2)

interface Props<T extends string | number> {
  options: readonly T[]
  value: T
  onChange: (next: T) => void
  format: (value: T) => string
  ariaLabel: string
}

/** iOS 시계 앱 스타일 — 세로 스크롤 휠 (1분 단위 등) */
export function AlarmWheelColumn<T extends string | number>({
  options,
  value,
  onChange,
  format,
  ariaLabel,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userScroll = useRef(false)

  const index = Math.max(0, options.indexOf(value))

  const scrollToIndex = useCallback((i: number, smooth = false) => {
    const el = ref.current
    if (!el) return
    const top = i * ITEM_H
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useEffect(() => {
    if (userScroll.current) return
    scrollToIndex(index)
  }, [index, scrollToIndex])

  const snap = useCallback(() => {
    const el = ref.current
    if (!el) return
    const i = Math.round(el.scrollTop / ITEM_H)
    const clamped = Math.max(0, Math.min(options.length - 1, i))
    scrollToIndex(clamped, true)
    const next = options[clamped]
    if (next !== undefined && next !== value) onChange(next)
  }, [onChange, options, scrollToIndex, value])

  const onScroll = () => {
    userScroll.current = true
    if (snapTimer.current) clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => {
      snap()
      userScroll.current = false
    }, 100)
  }

  return (
    <div className="relative flex-1 min-w-0 overflow-hidden" style={{ height: WHEEL_HEIGHT }} aria-label={ariaLabel}>
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 z-10 -translate-y-1/2 h-11 rounded-xl bg-surface-2/90 border border-border/60 shadow-sm"
        aria-hidden
      />
      <div
        ref={ref}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain overscroll-x-none snap-y snap-mandatory touch-pan-y [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          paddingTop: ITEM_H * PAD_ROWS,
          paddingBottom: ITEM_H * PAD_ROWS,
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
        onScroll={onScroll}
        onTouchEnd={() => {
          if (snapTimer.current) clearTimeout(snapTimer.current)
          snapTimer.current = setTimeout(snap, 60)
        }}
      >
        {options.map((opt) => {
          const active = opt === value
          return (
            <button
              key={String(opt)}
              type="button"
              className={`flex h-11 w-full snap-center items-center justify-center text-[22px] font-light tabular-nums transition-colors ${
                active ? 'text-ink font-medium' : 'text-muted/55'
              }`}
              onClick={() => {
                onChange(opt)
                scrollToIndex(options.indexOf(opt), true)
              }}
            >
              {format(opt)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
