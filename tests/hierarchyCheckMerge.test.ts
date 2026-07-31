// #3b 회귀: 트리(목표) 항목의 체크가 기기 간 병합에서 유실되던 버그.
// 원인: 겹치는 항목 병합이 번들 rev(preferLocal)를 따라, 방금 체크했어도 다른 기기가
// 조금 뒤 올린 번들이 더 최신이면 체크가 되돌아갔다. 일상 항목은 항목별 updatedAt으로
// 보호됐지만 트리 항목은 plan.updatedAt에만 의존 → 이제 그 plan.updatedAt으로 판정한다.
import { describe, expect, it } from 'bun:test'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { GoalPlan, PlanCheckItem } from '../src/types/goalPlan'

function planWithDayItems(updatedAt: string, items: PlanCheckItem[]): GoalPlan {
  return {
    id: 'plan-a', profileId: 'p', templateType: 'backplan', title: 'T',
    intake: { goal: 'x', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' },
    sections: [], createdAt: '2026-07-01T00:00:00.000Z', updatedAt,
    hierarchy: { horizon: 'week-day', rangeLabel: '7월', focus: '', startDate: '2026-07-01', deadline: '2026-07-31',
      months: [], currentWeekId: 'w1',
      weeks: [{ id: 'w1', globalIndex: 1, label: 'W1', dateLabel: '', focus: '', items: [], monthKeys: [], days: [
        { id: 'd1', dateLabel: '7/29', dayOfWeek: '수', focus: '', items } ] }],
      days: [] },
  } as GoalPlan
}
function pbundle(updatedAt: number, plans: GoalPlan[]): GoalDataBundle {
  return { ownerId: 'o', plans, miscTodos: [], routines: [], updatedAt }
}
function doneOf(m: GoalDataBundle): boolean | undefined {
  return m.plans[0]?.hierarchy?.weeks[0]?.days[0]?.items[0]?.done
}

describe('#3b 트리 항목 체크 유실 방지', () => {
  it('방금 체크한 목표(plan.updatedAt 최신)의 체크는, 원격 번들 rev가 더 높아도 유지된다', () => {
    // 방금 체크 → plan.updatedAt=10:00, 하지만 로컬 번들 rev(100)는 원격(999)보다 낮음
    const local = pbundle(100, [planWithDayItems('2026-07-29T10:00:00Z', [{ id: 'A', label: '운동', done: true }])])
    const remote = pbundle(999, [planWithDayItems('2026-07-29T09:00:00Z', [{ id: 'A', label: '운동', done: false }])])
    expect(doneOf(mergeGoalDataBundles(local, remote))).toBe(true)
    expect(doneOf(mergeGoalDataBundles(remote, local))).toBe(true) // 방향 무관
  })

  it('원격이 더 늦게 체크 해제했으면 그 해제가 이긴다 (최신 편집 우선)', () => {
    const local = pbundle(999, [planWithDayItems('2026-07-29T09:00:00Z', [{ id: 'A', label: '운동', done: true }])])
    const remote = pbundle(100, [planWithDayItems('2026-07-29T11:00:00Z', [{ id: 'A', label: '운동', done: false }])])
    expect(doneOf(mergeGoalDataBundles(local, remote))).toBe(false)
  })
})
