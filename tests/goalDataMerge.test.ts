// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기의 편집(체크·시간)이 다른 기기에 반영이
// 안 되거나, 한 기기 저장이 다른 기기가 올린 할 일을 지워버려 알림 예약까지 사라진다.
// 핵심: **일상 할 일은 항목별 updatedAt으로 최신을 가린다** (있으면). 없으면(옛 데이터)
// 번들 단위 규칙으로 물러난다.
import { describe, expect, it } from 'bun:test'
import type { GoalPlan } from '../types/goalPlan'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'

function misc(id: string, over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id, label: id, done: false, tier: 'daily', periodKey: '2026-07-27', ...over }
}

function bundle(
  updatedAt: number,
  miscTodos: MiscTodoItem[] = [],
  plans: GoalPlan[] = [],
): GoalDataBundle {
  return { ownerId: 'o', plans, miscTodos, routines: [], updatedAt }
}

function plan(id: string, over: Partial<GoalPlan> = {}): GoalPlan {
  return {
    id,
    profileId: 'o',
    templateType: 'branch',
    intake: { goal: id, deadline: '', successCriteria: '', progress: 'not_started' },
    title: id,
    sections: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
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
import type { PlanCheckItem } from '../src/types/goalPlan'

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

// 실사용 버그: 상대 기기에만 있는 "날짜 노드"의 항목이, skeleton엔 그 날이 없으면
// 예전엔 첫 날(노드[0])로 몰려가 "오늘 화면에서 사라진" 것처럼 보였다. 이제 제 날짜에 남는다.
describe('mergePlans — 상대에만 있는 날짜의 항목은 그 날짜에 남는다(엉뚱한 날로 안 옮김)', () => {
  function planTwoDays(updatedAt: string, day2Items: PlanCheckItem[]): GoalPlan {
    const p = planWithDayItems(updatedAt, [{ id: 'A', label: '7/29것', done: false }])
    // 7/30 날 노드를 추가 (여기에 항목을 둔다)
    p.hierarchy!.weeks[0].days.push({ id: 'd2', dateLabel: '7/30', dayOfWeek: '목', focus: '', items: day2Items })
    return p
  }
  function dayByLabel(merged: GoalDataBundle, label: string): string | undefined {
    for (const d of merged.plans[0]?.hierarchy?.weeks[0]?.days ?? []) {
      if (d.items.some((i) => i.label === label)) return d.dateLabel
    }
    return undefined
  }

  it('맥 skeleton(7/29만·rev높음)에 없는 7/30의 폰 항목 X는 7/30에 남는다', () => {
    const mac = pbundle(0, [planWithDayItems('2026-07-30T10:00:00Z', [{ id: 'A', label: '7/29것', done: false }])])
    const phone = pbundle(0, [planTwoDays('2026-07-30T09:00:00Z', [{ id: 'X', label: '7/30에추가', done: false }])])
    const merged = mergeGoalDataBundles(mac, phone)
    expect(dayByLabel(merged, '7/30에추가')).toBe('7/30') // 예전엔 '7/29'(첫 날)로 몰렸다
  })

  it('같은 항목이 두 날에 중복 생성되지 않는다', () => {
    const mac = pbundle(0, [planTwoDays('2026-07-30T10:00:00Z', [{ id: 'X', label: '공통X', done: false }])])
    const phone = pbundle(0, [planTwoDays('2026-07-30T09:00:00Z', [{ id: 'X', label: '공통X', done: false }])])
    const merged = mergeGoalDataBundles(mac, phone)
    const all = merged.plans[0]?.hierarchy?.weeks[0]?.days.flatMap((d) => d.items.filter((i) => i.id === 'X')) ?? []
    expect(all.length).toBe(1)
  })
})

// 삭제 전파: union 병합이라 표식이 없으면 삭제한 항목이 상대에 남아 되살아난다.
// plan.itemTombstones(지운 id→시각)에 오른 항목은 병합에서 트리에서 제거된다.
describe('mergePlans — 목표 항목 삭제 전파(묘비)', () => {
  it('한 기기가 X를 지우면(묘비), 상대에 X가 살아 있어도 병합 후 사라진다', () => {
    const deleted = planWithDayItems('2026-07-29T11:00:00Z', [{ id: 'A', label: '남김', done: false }])
    deleted.itemTombstones = { X: Date.now() } // X를 지웠다는 표식
    const other = planWithDayItems('2026-07-29T09:00:00Z', [
      { id: 'A', label: '남김', done: false },
      { id: 'X', label: '지운것', done: false },
    ])
    const merged = mergeGoalDataBundles(pbundle(0, [deleted]), pbundle(0, [other]))
    const ids = dayItems(merged).map((i) => i.id)
    expect(ids).toContain('A')
    expect(ids).not.toContain('X') // 부활하지 않는다
  })

  it('방향 무관 — 상대가 지웠어도(묘비만 상대에) 내 X가 사라진다', () => {
    const mine = planWithDayItems('2026-07-29T11:00:00Z', [
      { id: 'A', label: '남김', done: false },
      { id: 'X', label: '내게아직있음', done: false },
    ])
    const deleted = planWithDayItems('2026-07-29T09:00:00Z', [{ id: 'A', label: '남김', done: false }])
    deleted.itemTombstones = { X: Date.now() }
    const ids = dayItems(mergeGoalDataBundles(pbundle(0, [mine]), pbundle(0, [deleted]))).map((i) => i.id)
    expect(ids).not.toContain('X')
  })

  it('이동 회귀 방지: 묘비는 지운 그 id만 지운다 — 새 id로 다시 넣은 항목은 안 지운다', () => {
    // 이동 = 원본 old id 묘비 + 대상에 새 id. 묘비가 새 id를 건드리면 이동이 사라진다(PR#6).
    const moved = planWithDayItems('2026-07-29T11:00:00Z', [{ id: 'new-id', label: '옮긴것', done: false }])
    moved.itemTombstones = { 'old-id': Date.now() } // 원본에서 지운 옛 id
    const merged = mergeGoalDataBundles(pbundle(0, [moved]), pbundle(0, [moved]))
    expect(dayItems(merged).map((i) => i.id)).toContain('new-id') // 새 id는 살아있다
  })
})

describe('mergeGoalDataBundles — 목표(plan) 삭제 전파(툼스톤)', () => {
  it('지운 목표는 원격에 아직 살아 있어도 되살아나지 않는다', () => {
    const local = bundle(100, [], [plan('P1', { deletedAt: 5000 })])
    const remote = bundle(100, [], [plan('P1', { title: '원격-살아있음', updatedAt: '1970-01-01T00:00:01.000Z' })])
    const p = mergeGoalDataBundles(local, remote).plans.find((x) => x.id === 'P1')
    expect(p?.deletedAt).toBe(5000)
  })

  it('삭제한 뒤 다른 기기에서 더 늦게 고치면 되살아난다', () => {
    const local = bundle(0, [], [plan('P1', { deletedAt: 1000 })])
    const remote = bundle(0, [], [plan('P1', { title: 'P1부활', updatedAt: '2026-07-27T12:00:00.000Z' })])
    const p = mergeGoalDataBundles(local, remote).plans.find((x) => x.id === 'P1')
    expect(p?.deletedAt).toBeUndefined()
    expect(p?.title).toBe('P1부활')
  })
})
