import { describe, expect, it } from 'bun:test'
import { aggregateForDate } from '../src/lib/goalHierarchyEngine'
import {
  repairDuplicateHierarchyItemIds,
  removeAggregatedItem,
  toggleAggregatedItem,
} from '../src/lib/goalHierarchyMutations'

const DATE = new Date('2026-07-16T12:00:00')

/** 같은 item id가 두 날짜에 있으면(섹션 복사 버그) 전역 검색은 엉뚱한 날을 고친다 */
const planWithDuplicateDailyId = {
  id: 'plan-dup',
  profileId: 'p1',
  templateType: 'backplan' as const,
  title: '테스트',
  intake: { goal: 'g', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' as const },
  sections: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  hierarchy: {
    horizon: 'day-only' as const,
    rangeLabel: '7월',
    focus: '',
    startDate: '2026-07-01',
    deadline: '2026-07-31',
    months: [],
    weeks: [],
    days: [
      {
        id: 'd-old',
        dateLabel: '7/15',
        dayOfWeek: '수',
        focus: '',
        items: [{ id: 'dup-id', label: '고스트(어제)', done: false }],
      },
      {
        id: 'd-today',
        dateLabel: '7/16',
        dayOfWeek: '목',
        focus: '',
        items: [{ id: 'dup-id', label: '오늘 할 일', done: false }],
      },
    ],
    currentWeekId: '',
  },
}

describe('toggleAggregatedItem — 날짜 스코프', () => {
  it('선택한 날짜의 일간 항목만 토글한다', () => {
    const before = aggregateForDate([planWithDuplicateDailyId], DATE).daily
    expect(before).toHaveLength(1)
    expect(before[0].label).toBe('오늘 할 일')
    expect(before[0].done).toBe(false)

    const updated = toggleAggregatedItem([planWithDuplicateDailyId], 'plan-dup', 'dup-id', 'daily', DATE)
    expect(updated).not.toBeNull()

    const after = aggregateForDate([updated!], DATE).daily
    expect(after[0].done).toBe(true)

    const ghostDay = updated!.hierarchy!.days.find((d) => d.id === 'd-old')!
    expect(ghostDay.items[0].done).toBe(false)
  })

  it('선택한 날짜의 일간 항목만 삭제한다', () => {
    const updated = removeAggregatedItem([planWithDuplicateDailyId], 'plan-dup', 'dup-id', 'daily', DATE)
    expect(updated).not.toBeNull()

    const today = aggregateForDate([updated!], DATE).daily
    expect(today).toHaveLength(0)

    const ghostDay = updated!.hierarchy!.days.find((d) => d.id === 'd-old')!
    expect(ghostDay.items).toHaveLength(1)
  })
})

describe('repairDuplicateHierarchyItemIds', () => {
  it('중복 id를 새 UUID로 치환한다', () => {
    const { plan, changed } = repairDuplicateHierarchyItemIds(planWithDuplicateDailyId)
    expect(changed).toBe(true)

    const ids = plan.hierarchy!.days.flatMap((d) => d.items.map((it) => it.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
