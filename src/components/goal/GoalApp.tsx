import { useEffect, useMemo, useState } from 'react'
import { getGoalAppProfile } from '../../lib/goalAppOwner'
import { useAlarmScheduler } from '../../hooks/useAlarmScheduler'
import { AlarmDismissProvider } from '../alarm/AlarmDismissProvider'
import { loadGoalPlans } from '../../lib/goalPlanStore'
import { importGoalPlansSnapshot } from '../../lib/goalPlanSnapshot'
import { GoalPlanSheet } from './GoalPlanSheet'

/** Future Me 채팅과 분리된 독립 목표 앱 셸 */
export function GoalApp({
  embedded = false,
  onTellFuture,
}: {
  embedded?: boolean
  onTellFuture?: (prompt: string) => void
}) {
  const profile = useMemo(() => getGoalAppProfile(), [])
  const [ready, setReady] = useState(false)
  useAlarmScheduler()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let plans = loadGoalPlans(profile.id, profile)
      if (!plans.length && import.meta.env.DEV) {
        try {
          const res = await fetch('/goal-recovery-snapshot.json', { cache: 'no-store' })
          if (res.ok) {
            const snap = await res.json()
            if (snap?.ownerId && Array.isArray(snap.plans) && snap.plans.length) {
              importGoalPlansSnapshot(snap)
              plans = loadGoalPlans(profile.id, profile)
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  if (!ready) return null

  if (embedded) {
    return (
      <AlarmDismissProvider>
        <GoalPlanSheet profile={profile} embedded onTellFuture={onTellFuture} />
      </AlarmDismissProvider>
    )
  }

  return (
    <AlarmDismissProvider>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <a
        href="/"
        style={{
          flexShrink: 0,
          display: 'block',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '12px',
          textDecoration: 'none',
          color: 'var(--goal-accent-deep, #2f6b46)',
          background: 'var(--goal-accent-soft, #e6f4ea)',
          borderBottom: '1px solid var(--goal-line, #e5e8eb)',
        }}
      >
        ← Future Me 앱으로 돌아가기 · 이 화면은 목표 앱 단독 미리보기예요
      </a>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GoalPlanSheet profile={profile} embedded={false} />
      </div>
    </div>
    </AlarmDismissProvider>
  )
}
