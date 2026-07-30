import type { GoalHierarchy, GoalPlan, PlanCheckItem, PlanDay } from '../types/goalPlan'
import { getCurrentWeek, horizonShowsMonth, horizonShowsWeek, resolveDateSlots } from './goalHierarchyEngine'

function withHierarchy(plan: GoalPlan, fn: (h: GoalHierarchy) => GoalHierarchy): GoalPlan {
  if (!plan.hierarchy) return plan
  return { ...plan, hierarchy: fn(plan.hierarchy) }
}

function mapItems(items: PlanCheckItem[], itemId: string, fn: (it: PlanCheckItem) => PlanCheckItem): PlanCheckItem[] {
  return items.map((it) => (it.id === itemId ? fn(it) : it))
}

function newItem(label = ''): PlanCheckItem {
  return { id: crypto.randomUUID(), label, done: false }
}

/**
 * 지운 항목 id를 plan의 묘비(itemTombstones)에 남긴다 → 병합이 다른 기기에서 삭제를 전파한다.
 * 재추가·이동은 새 id를 받으므로 여기 안 걸린다(같은 id 부활 방지가 아니라 그 id의 삭제 전파).
 */
function withItemTombstone(plan: GoalPlan, itemId: string): GoalPlan {
  if (!itemId || itemId === '__blank__') return plan
  return { ...plan, itemTombstones: { ...(plan.itemTombstones ?? {}), [itemId]: Date.now() } }
}

/** 일간 항목이 속한 day 슬롯 — date가 있으면 그 날짜 노드만, 없으면 첫 전역 매치 */
function findDailyItemSlot(
  h: GoalHierarchy,
  itemId: string,
  date?: Date,
): { weekId: string | null; dayId: string } | null {
  if (date) {
    const slots = resolveDateSlots(h, date)
    if (!slots.dayId) return null
    const day =
      h.horizon === 'day-only'
        ? h.days.find((d) => d.id === slots.dayId)
        : h.weeks.find((w) => w.id === slots.dayWeekId)?.days.find((d) => d.id === slots.dayId)
    if (!day?.items.some((i) => i.id === itemId)) return null
    return { weekId: slots.dayWeekId, dayId: slots.dayId }
  }

  if (h.horizon === 'day-only') {
    for (const d of h.days) {
      if (d.items.some((i) => i.id === itemId)) return { weekId: null, dayId: d.id }
    }
  } else {
    for (const w of h.weeks) {
      for (const d of w.days) {
        if (d.items.some((i) => i.id === itemId)) return { weekId: w.id, dayId: d.id }
      }
    }
  }
  return null
}

/** hierarchy 전역에서 중복 item id를 새 UUID로 치환 (섹션 복사 등으로 생긴 고아 행 복구) */
export function repairDuplicateHierarchyItemIds(plan: GoalPlan): { plan: GoalPlan; changed: boolean } {
  if (!plan.hierarchy) return { plan, changed: false }

  const seen = new Set<string>()
  let changed = false

  const fixItems = (items: PlanCheckItem[]): PlanCheckItem[] =>
    items.map((it) => {
      if (!seen.has(it.id)) {
        seen.add(it.id)
        return it
      }
      changed = true
      const id = crypto.randomUUID()
      seen.add(id)
      return { ...it, id }
    })

  const fixDays = (days: PlanDay[]): PlanDay[] => days.map((d) => ({ ...d, items: fixItems(d.items) }))

  const h = plan.hierarchy
  const next: GoalHierarchy = {
    ...h,
    months: h.months.map((m) => ({ ...m, items: fixItems(m.items) })),
    weeks: h.weeks.map((w) => ({ ...w, items: fixItems(w.items), days: fixDays(w.days) })),
    days: fixDays(h.days),
  }

  if (!changed) return { plan, changed: false }
  return { plan: { ...plan, hierarchy: next }, changed: true }
}

export function addMonthItem(plan: GoalPlan, monthId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) => (m.id !== monthId ? m : { ...m, items: [...m.items, newItem('')] })),
  }))
}

export function setMonthItemLabel(plan: GoalPlan, monthId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) =>
      m.id !== monthId ? m : { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, label } : it)) },
    ),
  }))
}

export function upsertMonthItemLabel(plan: GoalPlan, monthId: string, itemId: string, label: string): GoalPlan {
  const m = plan.hierarchy?.months.find((x) => x.id === monthId)
  if (!m) return plan
  if (itemId !== '__blank__' && m.items.some((it) => it.id === itemId)) return setMonthItemLabel(plan, monthId, itemId, label)
  if (!label.trim()) return plan
  const empty = m.items.find((it) => !it.label.trim())
  if (empty) return setMonthItemLabel(plan, monthId, empty.id, label)
  const added = addMonthItem(plan, monthId)
  const newId = added.hierarchy!.months.find((x) => x.id === monthId)!.items.at(-1)!.id
  return setMonthItemLabel(added, monthId, newId, label)
}

export function removeMonthItem(plan: GoalPlan, monthId: string, itemId: string): GoalPlan {
  return withItemTombstone(
    withHierarchy(plan, (h) => ({
      ...h,
      months: h.months.map((m) => {
        if (m.id !== monthId) return m
        const next = m.items.filter((it) => it.id !== itemId)
        return { ...m, items: next.length ? next : [newItem('')] }
      }),
    })),
    itemId,
  )
}

export function addWeekItem(plan: GoalPlan, weekId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, items: [...w.items, newItem('')] })),
  }))
}

export function setWeekItemLabel(plan: GoalPlan, weekId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) =>
      w.id !== weekId ? w : { ...w, items: w.items.map((it) => (it.id === itemId ? { ...it, label } : it)) },
    ),
  }))
}

export function upsertWeekItemLabel(plan: GoalPlan, weekId: string, itemId: string, label: string): GoalPlan {
  const w = plan.hierarchy?.weeks.find((x) => x.id === weekId)
  if (!w) return plan
  if (itemId !== '__blank__' && w.items.some((it) => it.id === itemId)) return setWeekItemLabel(plan, weekId, itemId, label)
  if (!label.trim()) return plan
  const empty = w.items.find((it) => !it.label.trim())
  if (empty) return setWeekItemLabel(plan, weekId, empty.id, label)
  const added = addWeekItem(plan, weekId)
  const newId = added.hierarchy!.weeks.find((x) => x.id === weekId)!.items.at(-1)!.id
  return setWeekItemLabel(added, weekId, newId, label)
}

export function removeWeekItem(plan: GoalPlan, weekId: string, itemId: string): GoalPlan {
  return withItemTombstone(
    withHierarchy(plan, (h) => ({
      ...h,
      weeks: h.weeks.map((w) => {
        if (w.id !== weekId) return w
        const next = w.items.filter((it) => it.id !== itemId)
        return { ...w, items: next.length ? next : [newItem('')] }
      }),
    })),
    itemId,
  )
}

export function addDayItem(plan: GoalPlan, weekId: string | null, dayId: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return {
        ...h,
        days: h.days.map((d) => (d.id !== dayId ? d : { ...d, items: [...d.items, newItem('')] })),
      }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId
          ? w
          : { ...w, days: w.days.map((d) => (d.id !== dayId ? d : { ...d, items: [...d.items, newItem('')] })) },
      ),
    }
  })
}

export function setDayItemLabel(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    const mapDay = (d: PlanDay): PlanDay =>
      d.id !== dayId ? d : { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, label } : it)) }
    if (h.horizon === 'day-only') return { ...h, days: h.days.map(mapDay) }
    return {
      ...h,
      weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, days: w.days.map(mapDay) })),
    }
  })
}

export function setDayItemTime(
  plan: GoalPlan,
  weekId: string | null,
  dayId: string,
  itemId: string,
  timeStart?: string,
  timeEnd?: string,
): GoalPlan {
  return withHierarchy(plan, (h) => {
    const mapDay = (d: PlanDay): PlanDay =>
      d.id !== dayId
        ? d
        : {
            ...d,
            items: d.items.map((it) => {
              if (it.id !== itemId) return it
              const next = { ...it }
              if (timeStart?.trim()) next.timeStart = timeStart.trim()
              else delete next.timeStart
              if (timeEnd?.trim()) next.timeEnd = timeEnd.trim()
              else delete next.timeEnd
              return next
            }),
          }
    if (h.horizon === 'day-only') return { ...h, days: h.days.map(mapDay) }
    return {
      ...h,
      weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, days: w.days.map(mapDay) })),
    }
  })
}

export function upsertDayItemLabel(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string, label: string): GoalPlan {
  const h = plan.hierarchy
  if (!h) return plan
  const day =
    h.horizon === 'day-only'
      ? h.days.find((d) => d.id === dayId)
      : h.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId)
  if (!day) return plan
  if (itemId !== '__blank__' && day.items.some((it) => it.id === itemId)) return setDayItemLabel(plan, weekId, dayId, itemId, label)
  if (!label.trim()) return plan
  const empty = day.items.find((it) => !it.label.trim())
  if (empty) return setDayItemLabel(plan, weekId, dayId, empty.id, label)
  const added = addDayItem(plan, weekId, dayId)
  const ah = added.hierarchy!
  const newDay =
    ah.horizon === 'day-only'
      ? ah.days.find((d) => d.id === dayId)
      : ah.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId)
  const newId = newDay?.items.at(-1)?.id
  if (!newId) return added
  return setDayItemLabel(added, weekId, dayId, newId, label)
}

export function removeDayItem(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string): GoalPlan {
  return withItemTombstone(
    withHierarchy(plan, (h) => {
    const trimDay = (d: PlanDay): PlanDay => {
      if (d.id !== dayId) return d
      const next = d.items.filter((it) => it.id !== itemId)
      return { ...d, items: next.length ? next : [newItem('')] }
    }
    if (h.horizon === 'day-only') return { ...h, days: h.days.map(trimDay) }
    return {
      ...h,
      weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, days: w.days.map(trimDay) })),
    }
    }),
    itemId,
  )
}

export function toggleMonthNodeItem(plan: GoalPlan, monthId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) =>
      m.id !== monthId ? m : { ...m, items: mapItems(m.items, itemId, (it) => ({ ...it, done: !it.done })) },
    ),
  }))
}

export function toggleWeekItemH(plan: GoalPlan, weekId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) =>
      w.id !== weekId ? w : { ...w, items: mapItems(w.items, itemId, (it) => ({ ...it, done: !it.done })) },
    ),
  }))
}

export function toggleDayItem(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return {
        ...h,
        days: h.days.map((d) =>
          d.id !== dayId ? d : { ...d, items: mapItems(d.items, itemId, (it) => ({ ...it, done: !it.done })) },
        ),
      }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId
          ? w
          : {
              ...w,
              days: w.days.map((d) =>
                d.id !== dayId ? d : { ...d, items: mapItems(d.items, itemId, (it) => ({ ...it, done: !it.done })) },
              ),
            },
      ),
    }
  })
}

export function toggleAggregatedItem(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
  date?: Date,
): GoalPlan | null {
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null
  const h = plan.hierarchy

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) return toggleMonthNodeItem(plan, m.id, itemId)
    }
    return null
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) return toggleWeekItemH(plan, w.id, itemId)
    }
    return null
  }

  if (tier === 'daily') {
    const slot = findDailyItemSlot(h, itemId, date)
    if (slot) return toggleDayItem(plan, slot.weekId, slot.dayId, itemId)
  }
  return null
}

export function removeAggregatedItem(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
  date?: Date,
): GoalPlan | null {
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null
  const h = plan.hierarchy

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) return removeMonthItem(plan, m.id, itemId)
    }
    return null
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) return removeWeekItem(plan, w.id, itemId)
    }
    return null
  }

  if (tier === 'daily') {
    const slot = findDailyItemSlot(h, itemId, date)
    if (slot) return removeDayItem(plan, slot.weekId, slot.dayId, itemId)
  }
  return null
}

export function updateAggregatedItemLabel(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
  label: string,
  date?: Date,
): GoalPlan | null {
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null
  const h = plan.hierarchy

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) return setMonthItemLabel(plan, m.id, itemId, label)
    }
    return null
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) return setWeekItemLabel(plan, w.id, itemId, label)
    }
    return null
  }

  if (tier === 'daily') {
    const slot = findDailyItemSlot(h, itemId, date)
    if (slot) return setDayItemLabel(plan, slot.weekId, slot.dayId, itemId, label)
  }
  return null
}

export function updateAggregatedItemTime(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
  timeStart?: string,
  timeEnd?: string,
  date?: Date,
): GoalPlan | null {
  if (tier !== 'daily') return null
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null

  const slot = findDailyItemSlot(plan.hierarchy, itemId, date)
  if (!slot) return null
  return setDayItemTime(plan, slot.weekId, slot.dayId, itemId, timeStart, timeEnd)
}

/** @deprecated */
export function toggleMonthItem(plan: GoalPlan, itemId: string): GoalPlan {
  const m = plan.hierarchy?.months[0]
  if (!m) return plan
  return toggleMonthNodeItem(plan, m.id, itemId)
}

export function updateMonthNodeFocus(plan: GoalPlan, monthId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) => (m.id === monthId ? { ...m, focus } : m)),
  }))
}

export function updateWeekFocusH(plan: GoalPlan, weekId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) => (w.id === weekId ? { ...w, focus } : w)),
  }))
}

export function updateDayFocus(plan: GoalPlan, weekId: string | null, dayId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return { ...h, days: h.days.map((d) => (d.id === dayId ? { ...d, focus } : d)) }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId ? w : { ...w, days: w.days.map((d) => (d.id === dayId ? { ...d, focus } : d)) },
      ),
    }
  })
}

export function findWeekForItem(plan: GoalPlan, itemId: string) {
  return plan.hierarchy?.weeks.find((w) => w.items.some((i) => i.id === itemId) || w.days.some((d) => d.items.some((i) => i.id === itemId)))
}

/** 홈 달력에서 선택한 날짜·구간에 목표 한 줄 추가 → 드릴다운에도 반영 */
export function addTierGoalAtDate(
  plan: GoalPlan,
  date: Date,
  tier: 'daily' | 'weekly' | 'monthly',
  label: string,
): GoalPlan | null {
  if (!plan.hierarchy || !label.trim()) return null
  const slots = resolveDateSlots(plan.hierarchy, date)
  if (!slots.inRange) return null

  if (tier === 'monthly' && slots.monthId) {
    return upsertMonthItemLabel(plan, slots.monthId, '__blank__', label.trim())
  }
  if (tier === 'weekly' && slots.weekId) {
    return upsertWeekItemLabel(plan, slots.weekId, '__blank__', label.trim())
  }
  if (tier === 'daily' && slots.dayId) {
    return upsertDayItemLabel(plan, slots.dayWeekId, slots.dayId, '__blank__', label.trim())
  }
  return null
}

export function setAggregatedItemDone(
  plan: GoalPlan,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
  done: boolean,
): GoalPlan | null {
  if (!plan.hierarchy) return null
  const h = plan.hierarchy
  const setDone = (it: PlanCheckItem): PlanCheckItem => ({ ...it, done })

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) {
        return withHierarchy(plan, (hh) => ({
          ...hh,
          months: hh.months.map((month) =>
            month.id !== m.id
              ? month
              : { ...month, items: mapItems(month.items, itemId, (it) => (done ? setDone(it) : { ...it, done: false })) },
          ),
        }))
      }
    }
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) {
        return withHierarchy(plan, (hh) => ({
          ...hh,
          weeks: hh.weeks.map((week) =>
            week.id !== w.id
              ? week
              : { ...week, items: mapItems(week.items, itemId, (it) => (done ? setDone(it) : { ...it, done: false })) },
          ),
        }))
      }
    }
  }

  if (tier === 'daily') {
    if (h.horizon === 'day-only') {
      for (const d of h.days) {
        if (d.items.some((i) => i.id === itemId)) {
          return withHierarchy(plan, (hh) => ({
            ...hh,
            days: hh.days.map((day) =>
              day.id !== d.id
                ? day
                : { ...day, items: mapItems(day.items, itemId, (it) => (done ? setDone(it) : { ...it, done: false })) },
            ),
          }))
        }
      }
    } else {
      for (const w of h.weeks) {
        for (const d of w.days) {
          if (d.items.some((i) => i.id === itemId)) {
            return withHierarchy(plan, (hh) => ({
              ...hh,
              weeks: hh.weeks.map((week) =>
                week.id !== w.id
                  ? week
                  : {
                      ...week,
                      days: week.days.map((day) =>
                        day.id !== d.id
                          ? day
                          : { ...day, items: mapItems(day.items, itemId, (it) => (done ? setDone(it) : { ...it, done: false })) },
                      ),
                    },
              ),
            }))
          }
        }
      }
    }
  }

  return null
}

/** 홈에서 카테고리 옮길 때 — 새 항목을 추가하고 완료 상태를 유지한다 */
export function insertTierGoalAtDate(
  plan: GoalPlan,
  date: Date,
  tier: 'daily' | 'weekly' | 'monthly',
  label: string,
  done = false,
  timeStart?: string,
  timeEnd?: string,
): GoalPlan | null {
  if (!plan.hierarchy || !label.trim()) return null
  const slots = resolveDateSlots(plan.hierarchy, date)
  if (!slots.inRange) return null

  const trimmed = label.trim()
  let next: GoalPlan | null = null
  let itemId: string | undefined

  if (tier === 'monthly' && slots.monthId) {
    next = addMonthItem(plan, slots.monthId)
    itemId = next.hierarchy!.months.find((m) => m.id === slots.monthId)?.items.at(-1)?.id
    if (itemId) next = setMonthItemLabel(next, slots.monthId, itemId, trimmed)
  } else if (tier === 'weekly' && slots.weekId) {
    next = addWeekItem(plan, slots.weekId)
    itemId = next.hierarchy!.weeks.find((w) => w.id === slots.weekId)?.items.at(-1)?.id
    if (itemId) next = setWeekItemLabel(next, slots.weekId, itemId, trimmed)
  } else if (tier === 'daily' && slots.dayId) {
    next = addDayItem(plan, slots.dayWeekId, slots.dayId)
    const h = next.hierarchy!
    const day =
      h.horizon === 'day-only'
        ? h.days.find((d) => d.id === slots.dayId)
        : h.weeks.find((w) => w.id === slots.weekId)?.days.find((d) => d.id === slots.dayId)
    itemId = day?.items.at(-1)?.id
    if (itemId) next = setDayItemLabel(next, slots.dayWeekId, slots.dayId, itemId, trimmed)
  }

  if (!next || !itemId) return null
  if (tier === 'daily' && slots.dayId && (timeStart?.trim() || timeEnd?.trim())) {
    next = setDayItemTime(next, slots.dayWeekId, slots.dayId, itemId, timeStart, timeEnd)
  }
  if (done) return setAggregatedItemDone(next, itemId, tier, true) ?? next
  return next
}

export { getCurrentWeek, horizonShowsMonth, horizonShowsWeek }
