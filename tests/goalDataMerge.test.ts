// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기의 편집(체크·시간)이 다른 기기에 반영이
// 안 되거나, 한 기기 저장이 다른 기기가 올린 할 일을 지워버려 알림 예약까지 사라진다.
// 핵심: **일상 할 일은 항목별 updatedAt으로 최신을 가린다** (있으면). 없으면(옛 데이터)
// 번들 단위 규칙으로 물러난다.
import { describe, expect, it } from 'bun:test'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'

function misc(id: string, over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id, label: id, done: false, tier: 'daily', periodKey: '2026-07-27', ...over }
}

function bundle(updatedAt: number, miscTodos: MiscTodoItem[]): GoalDataBundle {
  return { ownerId: 'o', plans: [], miscTodos, routines: [], updatedAt }
}

// 항목 updatedAt이 없는 옛 데이터 — 번들 단위 규칙(preferLocal)으로 물러난다
describe('mergeGoalDataBundles — 항목 시각 없는 옛 데이터(번들 규칙)', () => {
  it('로컬이 더 최신이어도 원격에만 있는 할 일은 보존한다 (예약 사라짐 방지)', () => {
    const merged = mergeGoalDataBundles(bundle(200, [misc('Y')]), bundle(100, [misc('X')]))
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Y'])
  })

  it('같은 id 충돌은 번들이 더 최신인 쪽을 쓴다', () => {
    const local = bundle(200, [misc('X', { label: '로컬-최신' })])
    const remote = bundle(100, [misc('X', { label: '원격-옛것' })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.label).toBe('로컬-최신')
  })

  it('원격 번들이 더 최신이면 원격을 쓰되, 로컬에만 있는 할 일도 보존한다', () => {
    const local = bundle(100, [misc('X', { label: '로컬-옛것' }), misc('Z')])
    const remote = bundle(200, [misc('X', { label: '원격-최신' })])
    const merged = mergeGoalDataBundles(local, remote)
    expect(merged.miscTodos.find((t) => t.id === 'X')?.label).toBe('원격-최신')
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Z'])
  })
})

// 항목 updatedAt이 있으면 그걸로 판정 — 방향과 무관하게 최신 편집이 이긴다
describe('mergeGoalDataBundles — 항목별 최신 우선(updatedAt)', () => {
  it('원격에서 체크한 항목은, 로컬 번들 updatedAt이 더 커도 반영된다 (맥→폰 체크 전파)', () => {
    // 로컬 번들이 더 최신(200)이지만, 정작 X를 고친 건 원격(항목 updatedAt=5000)
    const local = bundle(200, [misc('X', { done: false })]) // 이 기기 X는 손 안 댐(항목 시각 없음)
    const remote = bundle(100, [misc('X', { done: true, updatedAt: 5000 })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.done).toBe(true)
  })

  it('로컬에서 방금 넣은 시간(항목 updatedAt)은 원격 번들이 더 최신이어도 유지된다 (회귀 방지)', () => {
    const local = bundle(100, [misc('X', { timeStart: '19:00', updatedAt: 9000 })])
    const remote = bundle(999, [misc('X', { updatedAt: 1000 })]) // 원격 번들은 최신이나 X는 옛 편집
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.timeStart).toBe('19:00')
  })

  it('둘 다 항목 updatedAt이 있으면 더 큰 쪽이 이긴다', () => {
    const local = bundle(0, [misc('X', { label: '로컬', updatedAt: 100 })])
    const remote = bundle(0, [misc('X', { label: '원격', updatedAt: 200 })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.label).toBe('원격')
  })
})

// 삭제 전파 — 툼스톤(deletedAt)이 병합에서 어떻게 이기고 지는가
describe('mergeGoalDataBundles — 삭제 전파(툼스톤)', () => {
  it('지운 항목은 원격에 아직 살아 있어도 되살아나지 않는다', () => {
    const local = bundle(0, [misc('X', { deletedAt: 5000 })]) // 이 기기서 지움
    const remote = bundle(999, [misc('X', { updatedAt: 1000 })]) // 다른 기기엔 아직 살아 있음(옛 편집)
    const x = mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')
    expect(x?.deletedAt).toBe(5000) // 여전히 삭제 상태 → 화면에서 걸러짐
  })

  it('삭제한 뒤 다른 기기에서 더 늦게 고치면 되살아난다', () => {
    const local = bundle(0, [misc('X', { deletedAt: 1000 })])
    const remote = bundle(0, [misc('X', { label: 'X부활', updatedAt: 5000 })])
    const x = mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')
    expect(x?.deletedAt).toBeUndefined()
    expect(x?.label).toBe('X부활')
  })
})

// ── 목표 항목 병합 — 통짜 교체가 아니라 항목별 합집합이라 어느 기기 것도 안 사라진다
import type { GoalPlan, PlanCheckItem } from '../src/types/goalPlan'

function planWithDayItems(updatedAt: string, items: PlanCheckItem[]): GoalPlan {
  return {
    id: 'plan-a',
    profileId: 'p',
    templateType: 'backplan',
    title: '앱 출시',
    intake: { goal: '앱', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' },
    sections: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt,
    hierarchy: {
      horizon: 'week-day',
      rangeLabel: '7월',
      focus: '',
      startDate: '2026-07-01',
      deadline: '2026-07-31',
      months: [],
      currentWeekId: 'w1',
      weeks: [
        { id: 'w1', globalIndex: 1, label: 'W1', dateLabel: '', focus: '', items: [], monthKeys: [], days: [
          { id: 'd1', dateLabel: '7/29', dayOfWeek: '수', focus: '', items },
        ] },
      ],
      days: [],
    },
  }
}

function pbundle(updatedAt: number, plans: GoalPlan[]): GoalDataBundle {
  return { ownerId: 'o', plans, miscTodos: [], routines: [], updatedAt }
}

function dayItems(merged: GoalDataBundle): PlanCheckItem[] {
  return merged.plans[0]?.hierarchy?.weeks[0]?.days[0]?.items ?? []
}

describe('mergePlans — 목표 항목 합집합(데이터 손실 방지)', () => {
  it('로컬이 방금 추가한 목표 항목은, 번들이 더 오래됐어도 사라지지 않는다', () => {
    const local = pbundle(100, [planWithDayItems('2026-07-29T10:00:00Z', [
      { id: 'A', label: '기존', done: false },
      { id: 'B', label: '방금 추가', done: false },
    ])])
    const remote = pbundle(999, [planWithDayItems('2026-07-29T09:00:00Z', [
      { id: 'A', label: '기존', done: false },
    ])])
    const labels = dayItems(mergeGoalDataBundles(local, remote)).map((i) => i.label)
    expect(labels).toContain('방금 추가') // 통짜 교체였으면 여기서 사라졌다
  })

  it('두 기기가 서로 다른 목표 항목을 추가하면 둘 다 남는다', () => {
    const mac = pbundle(200, [planWithDayItems('2026-07-29T10:00:00Z', [
      { id: 'A', label: '공통', done: false },
      { id: 'X', label: '맥에서', done: false },
    ])])
    const phone = pbundle(100, [planWithDayItems('2026-07-29T09:00:00Z', [
      { id: 'A', label: '공통', done: false },
      { id: 'Y', label: '폰에서', done: false },
    ])])
    const ids = dayItems(mergeGoalDataBundles(mac, phone)).map((i) => i.id)
    expect(ids).toContain('X')
    expect(ids).toContain('Y')
  })

  it('같은 항목의 체크 상태는 번들이 더 최신인 쪽을 따른다', () => {
    const checked = pbundle(500, [planWithDayItems('2026-07-29T11:00:00Z', [
      { id: 'A', label: '운동', done: true },
    ])])
    const old = pbundle(100, [planWithDayItems('2026-07-29T09:00:00Z', [
      { id: 'A', label: '운동', done: false },
    ])])
    expect(dayItems(mergeGoalDataBundles(checked, old))[0].done).toBe(true)
    expect(dayItems(mergeGoalDataBundles(old, checked))[0].done).toBe(true)
  })
})

describe('mergePlans — 두 기기 날 노드 id가 달라도 항목 안 잃음(날짜로 매칭)', () => {
  function planDayId(updatedAt: string, dayId: string, items: PlanCheckItem[]): GoalPlan {
    const p = planWithDayItems(updatedAt, items)
    p.hierarchy!.weeks[0].days[0].id = dayId // 같은 날짜, 다른 노드 id
    return p
  }
  it('폰(항목없음·rev높음)이 클라우드(항목있음)를 덮어써도, 날 노드 id가 달라도 항목이 산다', () => {
    // 실사용 버그: 폰과 맥의 날 노드 id가 독립 생성돼 달랐다 → 예전엔 여기서 사라졌다
    const phone = pbundle(9999, [planDayId('2026-07-29T09:00:00Z', 'day-phone', [])])
    const cloud = pbundle(100, [planDayId('2026-07-29T10:00:00Z', 'day-mac', [
      { id: 'X', label: '맥에서추가', done: false },
    ])])
    const labels = dayItems(mergeGoalDataBundles(phone, cloud)).map((i) => i.label)
    expect(labels).toContain('맥에서추가')
  })
})

describe('mergePlans — 목표 항목 삭제 전파(deletedItems)', () => {
  it('한 기기에서 지운 목표 항목은, 다른 기기에 아직 살아 있어도 되살아나지 않는다', () => {
    // 맥: X를 지움(항목 배열에서 빠지고 deletedItems에 기록)
    const macDeleted = planWithDayItems('2026-07-30T10:00:00Z', [{ id: 'A', label: '남김', done: false }])
    macDeleted.deletedItems = { X: Date.now() }
    // 폰: X가 아직 살아 있음
    const phoneStillHas = planWithDayItems('2026-07-30T09:00:00Z', [
      { id: 'A', label: '남김', done: false },
      { id: 'X', label: '지워질것', done: false },
    ])
    const ids1 = dayItems(mergeGoalDataBundles(pbundle(200, [macDeleted]), pbundle(100, [phoneStillHas]))).map((i) => i.id)
    expect(ids1).toContain('A')
    expect(ids1).not.toContain('X') // 삭제 전파됨
    // 방향 반대도 동일해야 한다
    const ids2 = dayItems(mergeGoalDataBundles(pbundle(100, [phoneStillHas]), pbundle(200, [macDeleted]))).map((i) => i.id)
    expect(ids2).not.toContain('X')
  })
})
