import type { ReactNode } from 'react'

/** 목표 가지치기 · 생성 위저드용 커스텀 아이콘 (이모지 대신) */
export type GoalBranchIconKind = 'target' | 'routine'

interface SvgProps {
  className?: string
}

export function GoalTargetIcon({ className }: SvgProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <path
        d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  )
}

export function GoalRoutineIcon({ className }: SvgProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M16.8 8.2a6.2 6.2 0 0 0-10.9-1.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 15.8a6.2 6.2 0 0 0 10.9 1.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M5.6 5.2 5.6 9.1 9.5 9.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.4 18.8 18.4 14.9 14.5 14.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function renderGoalBranchIcon(icon: GoalBranchIconKind | ReactNode): ReactNode {
  if (icon === 'target') return <GoalTargetIcon className="goal-branch-svg" />
  if (icon === 'routine') return <GoalRoutineIcon className="goal-branch-svg" />
  return icon
}

export function goalPlanIconKind(isRoutine: boolean): GoalBranchIconKind {
  return isRoutine ? 'routine' : 'target'
}
