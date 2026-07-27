/** 일간 할 일 완료율 → 타일 채움 색 (Aurora 팔레트) */
export function batteryFillColor(pct: number, hasTasks: boolean): string {
  if (!hasTasks) return 'transparent'
  if (pct >= 100) return '#14161c'
  if (pct >= 80) return '#3f4453'
  if (pct >= 60) return '#f0a92c'
  if (pct >= 40) return '#f6c266'
  if (pct >= 20) return '#fad998'
  return '#f3d4d4'
}

interface Props {
  done?: number
  total?: number
  pct?: number
  hasTasks: boolean
  inRange?: boolean
}

export function GoalBatteryIcon({ done, total, pct, hasTasks, inRange = true }: Props) {
  const fillPct =
    hasTasks && total && total > 0
      ? (done ?? 0) / total * 100
      : hasTasks && pct !== undefined
        ? pct
        : 0
  const colorPct = Math.round(fillPct)
  const fillColor = batteryFillColor(colorPct, hasTasks)
  const muted = !inRange

  return (
    <div className={`goal-battery ${muted ? 'muted' : ''}`} aria-hidden>
      <div className="goal-battery-cap" />
      <div className="goal-battery-body">
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
