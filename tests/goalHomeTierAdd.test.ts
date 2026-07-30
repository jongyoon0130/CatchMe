import { describe, expect, it } from 'bun:test'
import { aggregateForDate } from '../src/lib/goalHierarchyEngine'
import { insertTierGoalAtDate } from '../src/lib/goalHierarchyMutations'

const DATE = new Date('2026-07-16T12:00:00')

const planA = {
  id: 'plan-a',
  profileId: 'p1',
  templateType: 'backplan' as const,
  title: '앱 출시',
  intake: { goal: '앱', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' as const },
  sections: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  hierarchy: {
    horizon: 'month-week-day' as const,
    rangeLabel: '7월',
    focus: '',
    startDate: '2026-07-01',
    deadline: '2026-07-31',
    months: [{ id: 'm1', key: '2026-07', label: '7월', focus: '', items: [] }],
    weeks: [
      {
        id: 'w1',
        globalIndex: 1,
        label: 'W3',
        dateLabel: '',
        focus: '',
        items: [],
        monthKeys: ['2026-07'],
        days: [{ id: 'd1', dateLabel: '7/16', dayOfWeek: '목', focus: '', items: [] }],
      },
    ],
    days: [],
    currentWeekId: 'w1',
  },
}

describe('insertTierGoalAtDate — 홈 추가 행(목표 먼저 선택)', () => {
  it('일간: 목표를 먼저 고른 뒤 추가해도 해당 planId로 남는다', () => {
    const next = insertTierGoalAtDate(planA, DATE, 'daily', '헬스')
    expect(next).not.toBeNull()
    const daily = aggregateForDate([next!], DATE).daily
    expect(daily.some((it) => it.planId === 'plan-a' && it.label === '헬스')).toBe(true)
  })

  it('월간: 목표를 먼저 고른 뒤 추가해도 해당 planId로 남는다', () => {
    const next = insertTierGoalAtDate(planA, DATE, 'monthly', 'MVP 모델 만들기')
    expect(next).not.toBeNull()
    const monthly = aggregateForDate([next!], DATE).monthly
    expect(monthly.some((it) => it.planId === 'plan-a' && it.label === 'MVP 모델 만들기')).toBe(true)
  })
})
