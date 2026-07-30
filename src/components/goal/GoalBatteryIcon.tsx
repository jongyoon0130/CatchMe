/** 일간 할 일 완료율 → 배터리 색 (파스텔 톤) */
export function batteryFillColor(pct: number, hasTasks: boolean): string {
  if (!hasTasks) return 'transparent'
  if (pct >= 100) return '#62d98a'
  if (pct >= 80) return '#9ee07a'
  if (pct >= 60) return '#ffe082'
  if (pct >= 40) return '#ffcc80'
  if (pct >= 20) return '#ffab91'
  return '#ff9090'
}

/** 할 일은 있지만 아직 하나도 안 한 날 (0%) */
export function isBatteryDischarge(hasTasks: boolean, fillPct: number): boolean {
  return hasTasks && fillPct <= 0
}

function BatteryBolt() {
  return (
    <svg className="goal-battery-bolt" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
      <path d="M7.2 0 2 9h3.4L4.2 16 10 7H6.4L7.2 0Z" />
    </svg>
  )
}

interface Props {
  done?: number
  total?: number
  pct?: number
  hasTasks: boolean
}

export function GoalBatteryIcon({ done, total, pct, hasTasks }: Props) {
  const fillPct =
    hasTasks && total && total > 0
      ? ((done ?? 0) / total) * 100
      : hasTasks && pct !== undefined
        ? pct
        : 0
  const colorPct = Math.round(fillPct)
  const fillColor = batteryFillColor(colorPct, hasTasks)
  const discharge = isBatteryDischarge(hasTasks, fillPct)

  return (
    <div className={`goal-battery${discharge ? ' goal-battery--discharge' : ''}`} aria-hidden>
      <div className="goal-battery-cap" />
      <div className="goal-battery-body">
        {discharge ? <BatteryBolt /> : null}
        {hasTasks && fillPct > 0 ? (
          <div
            className="goal-battery-fill"
            style={{
              height: `${Math.max(0, Math.min(100, fillPct))}%`,
              background: fillColor,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
