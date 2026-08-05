import type { AlarmAlertMode } from '../../lib/alarmAlertMode'

type Props = {
  mode: AlarmAlertMode
  active?: boolean
  size?: number
}

/** iPhone 비율 (~9:16) — 가로 9.5 · 세로 14.75 */
const PHONE = { x: 7.25, y: 4.75, w: 9.5, h: 14.75, rx: 1.55 }
const ISLAND = { x: 10.35, y: 6.05, w: 3.3, h: 0.95, rx: 0.48 }

/** 알람 울림 방식 — 동일한 폰 실루엣 + 모드별 좌우 표시 */
export function AlertModePhoneIcon({ mode, active = false, size = 30 }: Props) {
  const stroke = active ? 1.85 : 1.5
  const opacity = active ? 1 : 0.38

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-ink shrink-0"
      style={{ opacity }}
    >
      {mode === 'vibrate' ? (
        <>
          <path
            d="M2.6 9.2 4.8 11.2 2.6 13.2 4.8 15.2 2.6 17.2"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21.4 9.2 19.2 11.2 21.4 13.2 19.2 15.2 21.4 17.2"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}

      {mode === 'sound' ? (
        <>
          <path
            d="M3.8 10.8a2.4 2.4 0 0 1 0 2.4"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d="M1.8 8.8a5.2 5.2 0 0 1 0 6.4"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d="M20.2 10.8a2.4 2.4 0 0 0 0 2.4"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d="M22.2 8.8a5.2 5.2 0 0 0 0 6.4"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </>
      ) : null}

      <rect
        x={PHONE.x}
        y={PHONE.y}
        width={PHONE.w}
        height={PHONE.h}
        rx={PHONE.rx}
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <rect
        x={ISLAND.x}
        y={ISLAND.y}
        width={ISLAND.w}
        height={ISLAND.h}
        rx={ISLAND.rx}
        fill="currentColor"
      />

      {mode === 'silent' ? (
        <path
          d="M7.1 6.9 16.9 17.3"
          stroke="currentColor"
          strokeWidth={stroke + 0.2}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}
