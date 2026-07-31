import type { GoalPlan, PlanCheckItem, PlanDay, GoalHierarchy } from '../types/goalPlan'
import { getGoalAppOwnerId } from './goalAppOwner'
import {
  fetchRemoteGoalData,
  getActiveSyncUser,
  isCloudSyncAvailable,
  pushGoalDataToCloud,
  type RemoteGoalDataRow,
} from './cloudSync'
import { loadGoalPlansForSync } from './goalPlanStore'
import { writeGoalPlanSnapshot } from './goalPlanSnapshot'
import { loadMiscTodos, type MiscTodoItem } from './goalMiscTodos'
import { loadRoutines, type MiscRoutine } from './goalRoutines'
import { syncRemindersToCloud } from './reminderSync'
import { isApplyingRemoteGoalData, setApplyingRemoteGoalData } from './goalDataSyncState'

const REVISION_KEY = 'futureme-goal-data-revision'
export const GOAL_DATA_SYNC_EVENT = 'futureme-goal-data-synced'

export type GoalDataBundle = {
  ownerId: string
  plans: GoalPlan[]
  miscTodos: MiscTodoItem[]
  routines: MiscRoutine[]
  updatedAt: number
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

// 실시간 반영에서 "내가 방금 올린 변경이 되돌아오는 것(에코)"을 걸러내기 위한 표식.
// **시계값(updatedAt)에 안 기댄다** — 기기 시계가 어긋나면 남의 변경을 에코로 오인해
// 놓치거나, 내 것을 남의 것으로 오인해 무한 반영될 수 있다. 대신 내용을 직렬화해
// "지금 클라우드에 있다고 아는 내용"과 같으면 건너뛴다.
let knownCloudContent = ''

function serializeGoalData(b: GoalDataBundle): string {
  return JSON.stringify([b.plans, b.miscTodos, b.routines])
}

export function getGoalDataRevision(): number {
  try {
    return Number(localStorage.getItem(REVISION_KEY) || 0)
  } catch {
    return 0
  }
}

export function markGoalDataRevision(ts = Date.now()): number {
  try {
    localStorage.setItem(REVISION_KEY, String(ts))
  } catch {
    /* ignore */
  }
  return ts
}

export function loadLocalGoalDataBundle(): GoalDataBundle {
  const ownerId = getGoalAppOwnerId()
  return {
    ownerId,
    plans: loadGoalPlansForSync(ownerId),
    miscTodos: loadMiscTodos(ownerId),
    routines: loadRoutines(ownerId),
    updatedAt: getGoalDataRevision(),
  }
}

export function hasLocalGoalData(): boolean {
  const bundle = loadLocalGoalDataBundle()
  return bundle.plans.length > 0 || bundle.miscTodos.length > 0 || bundle.routines.length > 0
}

function plansKey(ownerId: string): string {
  return `goal-plans-${ownerId}`
}

function miscKey(ownerId: string): string {
  return `goal-misc-todos-${ownerId}`
}

function routinesKey(ownerId: string): string {
  return `goal-misc-routines-${ownerId}`
}

export function applyLocalGoalDataBundle(bundle: GoalDataBundle): void {
  setApplyingRemoteGoalData(true)
  try {
    localStorage.setItem('goal-app-owner-id', bundle.ownerId)
    localStorage.setItem(plansKey(bundle.ownerId), JSON.stringify(bundle.plans))
    localStorage.setItem(miscKey(bundle.ownerId), JSON.stringify(bundle.miscTodos))
    localStorage.setItem(routinesKey(bundle.ownerId), JSON.stringify(bundle.routines))
    writeGoalPlanSnapshot(bundle.ownerId, bundle.plans.filter((p) => p.deletedAt == null))
    markGoalDataRevision(bundle.updatedAt)
  } finally {
    setApplyingRemoteGoalData(false)
  }
  window.dispatchEvent(new CustomEvent(GOAL_DATA_SYNC_EVENT))
}

/**
 * 두 항목 배열을 id로 합친다(합집합) — pref 쪽 버전·순서를 유지하고, other에만 있는 항목을
 * 뒤에 붙인다. **어느 쪽도 항목을 잃지 않는다.** 같은 id는 pref가 이긴다.
 */
function unionItems(pref: PlanCheckItem[], other: PlanCheckItem[]): PlanCheckItem[] {
  const ids = new Set(pref.map((it) => it.id))
  const extras = other.filter((it) => !ids.has(it.id))
  return extras.length ? [...pref, ...extras] : pref
}

/** 노드를 **날짜(의미)**로 맞추기 위한 키. 두 기기의 노드 id가 달라도 같은 날짜면 매칭된다. */
function dayKey(d: PlanDay): string {
  return `${d.dateLabel}|${d.dayOfWeek}`
}

const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60일 뒤 묘비 정리

/** 두 목표의 삭제 묘비(id→시각)를 합친다 — 더 늦은 삭제를 쓰고, 오래된 건 버린다. */
function mergeItemTombstones(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!a && !b) return undefined
  const out: Record<string, number> = { ...(a ?? {}) }
  for (const [id, t] of Object.entries(b ?? {})) {
    if (out[id] == null || t > out[id]) out[id] = t
  }
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  for (const [id, t] of Object.entries(out)) if (t < cutoff) delete out[id]
  return Object.keys(out).length ? out : undefined
}

/** 묘비에 오른 id의 항목을 트리에서 제거한다(삭제 전파). 재추가·이동은 새 id라 안 걸린다. */
function stripTombstonedItems(h: GoalHierarchy, tombs: Record<string, number> | undefined): GoalHierarchy {
  if (!tombs || !Object.keys(tombs).length) return h
  const keep = (items: PlanCheckItem[]) => items.filter((it) => tombs[it.id] == null)
  return {
    ...h,
    months: h.months.map((m) => ({ ...m, items: keep(m.items) })),
    weeks: h.weeks.map((w) => ({ ...w, items: keep(w.items), days: w.days.map((d) => ({ ...d, items: keep(d.items) })) })),
    days: h.days.map((d) => ({ ...d, items: keep(d.items) })),
  }
}

function allItemIds(h: GoalHierarchy): Set<string> {
  const s = new Set<string>()
  for (const m of h.months) for (const it of m.items) s.add(it.id)
  for (const w of h.weeks) {
    for (const it of w.items) s.add(it.id)
    for (const d of w.days) for (const it of d.items) s.add(it.id)
  }
  for (const d of h.days) for (const it of d.items) s.add(it.id)
  return s
}

/** other 트리의 모든 항목을 tier별로 모은다 (안전망용) */
function collectByTier(h: GoalHierarchy): { monthly: PlanCheckItem[]; weekly: PlanCheckItem[]; daily: PlanCheckItem[] } {
  const monthly: PlanCheckItem[] = []
  const weekly: PlanCheckItem[] = []
  const daily: PlanCheckItem[] = []
  for (const m of h.months) monthly.push(...m.items)
  for (const w of h.weeks) {
    weekly.push(...w.items)
    for (const d of w.days) daily.push(...d.items)
  }
  for (const d of h.days) daily.push(...d.items)
  return { monthly, weekly, daily }
}

/**
 * 같은 목표(id)의 두 버전을 합친다 — 뼈대(제목·기간·초점)는 preferLocal 쪽을 쓰고,
 * 트리 안 항목은 **날짜로 매칭해** 합집합. 예전엔 노드 id로 맞췄는데, 두 기기의 날 노드
 * id가 (독립 생성돼) 다르면 매칭 실패로 항목이 사라졌다(데이터 손실). 이제 날짜로 맞추고,
 * 그래도 안 들어간 항목은 tier별 대표 노드에 붙여 **어떤 항목도 잃지 않는다.**
 */
function mergePlanPair(local: GoalPlan, remote: GoalPlan, preferLocal: boolean): GoalPlan {
  const pref = preferLocal ? local : remote
  const other = preferLocal ? remote : local
  const ph = pref.hierarchy
  const oh = other.hierarchy
  if (!ph || !oh) return pref

  const oMonth = new Map(oh.months.map((m) => [m.key, m]))
  const oWeek = new Map(oh.weeks.map((w) => [String(w.globalIndex), w]))
  const oDayTop = new Map(oh.days.map((d) => [dayKey(d), d]))

  // pref에 이미 있는 항목 id — other 노드를 통째로 들여올 때 같은 항목이 두 노드에
  // 중복되지 않게 거른다.
  const prefItemIds = allItemIds(ph)
  const withoutPrefItems = <T extends { items: PlanCheckItem[] }>(node: T): T => ({
    ...node,
    items: node.items.filter((it) => !prefItemIds.has(it.id)),
  })

  const prefMonthKeys = new Set(ph.months.map((m) => m.key))
  const prefWeekKeys = new Set(ph.weeks.map((w) => String(w.globalIndex)))
  const prefDayTopKeys = new Set(ph.days.map((d) => dayKey(d)))

  const merged: GoalHierarchy = {
    ...ph,
    months: ph.months.map((m) => {
      const o = oMonth.get(m.key)
      return o ? { ...m, items: unionItems(m.items, o.items) } : m
    }),
    weeks: ph.weeks.map((w) => {
      const ow = oWeek.get(String(w.globalIndex))
      if (!ow) return w
      const oDay = new Map(ow.days.map((d) => [dayKey(d), d]))
      const prefWeekDayKeys = new Set(w.days.map((d) => dayKey(d)))
      // 이 주에서 pref가 가진 날은 항목 union, pref에 없는 other 날은 통째로 추가(제 날짜 유지)
      const days = w.days.map((d) => {
        const od = oDay.get(dayKey(d))
        return od ? { ...d, items: unionItems(d.items, od.items) } : d
      })
      for (const od of ow.days) {
        if (prefWeekDayKeys.has(dayKey(od))) continue
        const fresh = withoutPrefItems(od)
        if (fresh.items.length) days.push(fresh)
      }
      return { ...w, items: unionItems(w.items, ow.items), days }
    }),
    days: ph.days.map((d) => {
      const o = oDayTop.get(dayKey(d))
      return o ? { ...d, items: unionItems(d.items, o.items) } : d
    }),
  }

  // pref에 아예 없던 other의 월·주·일 노드는 **그 항목을 제 날짜에 살려두기 위해** 통째로 들여온다.
  // (예전 고아 안전망은 매칭 안 된 항목을 노드[0]=첫 날로 몰아넣어, 폰이 7/31에 넣은 항목이
  //  맥엔 7/31 노드가 없을 때 7/30으로 옮겨져 "오늘 화면에서 사라진" 것처럼 보였다.)
  for (const om of oh.months) {
    if (prefMonthKeys.has(om.key)) continue
    const fresh = withoutPrefItems(om)
    if (fresh.items.length) merged.months.push(fresh)
  }
  for (const ow of oh.weeks) {
    if (prefWeekKeys.has(String(ow.globalIndex))) continue
    const freshDays = ow.days.map(withoutPrefItems).filter((d) => d.items.length)
    const freshWeekItems = ow.items.filter((it) => !prefItemIds.has(it.id))
    if (freshDays.length || freshWeekItems.length) merged.weeks.push({ ...ow, items: freshWeekItems, days: freshDays })
  }
  for (const od of oh.days) {
    if (prefDayTopKeys.has(dayKey(od))) continue
    const fresh = withoutPrefItems(od)
    if (fresh.items.length) merged.days.push(fresh)
  }

  // 최후 안전망: horizon이 서로 달라 노드 자체가 없어 위에서도 못 들인 항목만 tier 대표 노드에 붙인다.
  const placed = allItemIds(merged)
  const { monthly, weekly, daily } = collectByTier(oh)
  const orphanMonthly = monthly.filter((it) => !placed.has(it.id))
  const orphanWeekly = weekly.filter((it) => !placed.has(it.id))
  const orphanDaily = daily.filter((it) => !placed.has(it.id))
  if (orphanMonthly.length && merged.months[0]) {
    merged.months[0] = { ...merged.months[0], items: [...merged.months[0].items, ...orphanMonthly] }
  }
  if (orphanWeekly.length && merged.weeks[0]) {
    merged.weeks[0] = { ...merged.weeks[0], items: [...merged.weeks[0].items, ...orphanWeekly] }
  }
  if (orphanDaily.length) {
    if (merged.weeks[0]?.days[0]) {
      const w0 = merged.weeks[0]
      const d0 = w0.days[0]
      merged.weeks[0] = { ...w0, days: [{ ...d0, items: [...d0.items, ...orphanDaily] }, ...w0.days.slice(1)] }
    } else if (merged.days[0]) {
      merged.days[0] = { ...merged.days[0], items: [...merged.days[0].items, ...orphanDaily] }
    }
  }

  // 삭제 묘비를 합치고, 묘비에 오른 항목은 트리에서 제거한다 → 한 기기 삭제가 다른 기기에 전파.
  // (union 병합이라 이게 없으면 상대에 남아 있는 항목이 1~2초 만에 되살아난다.)
  const itemTombstones = mergeItemTombstones(pref.itemTombstones, other.itemTombstones)
  return { ...pref, hierarchy: stripTombstonedItems(merged, itemTombstones), itemTombstones }
}

function planTime(plan: GoalPlan): number | undefined {
  if (plan.deletedAt != null) return plan.deletedAt
  const t = Date.parse(plan.updatedAt)
  return Number.isFinite(t) ? t : undefined
}

function pickNewerPlan(local: GoalPlan, remote: GoalPlan, preferLocal: boolean): GoalPlan {
  const lt = planTime(local)
  const rt = planTime(remote)
  if (lt != null && rt != null) return lt >= rt ? local : remote
  if (lt != null) return local
  if (rt != null) return remote
  return preferLocal ? local : remote
}

/** 같은 id 목표 — plan 삭제(툼스톤)가 이기면 통째로 지우고, 아니면 항목별 병합 */
function mergePlanAtId(local: GoalPlan, remote: GoalPlan, preferLocal: boolean): GoalPlan {
  const newer = pickNewerPlan(local, remote, preferLocal)
  if (newer.deletedAt != null) return newer
  const older = newer === local ? remote : local
  if (older.deletedAt != null) return newer // 삭제 뒤 더 늦은 편집 → 되살아남
  // 겹치는 항목(체크 등)은 **더 최근에 편집된 목표(plan.updatedAt)** 쪽을 따른다.
  // 번들 rev(preferLocal)로 고르면, 방금 트리 항목을 체크했어도 다른 기기가 조금 뒤
  // 올린 번들이 더 최신일 때 체크가 되돌아갔다(#3b). touchGoalPlan이 체크마다
  // plan.updatedAt을 갱신하므로, 방금 체크한 쪽이 pickNewerPlan에서 이긴다.
  // ponytail: 항목별 타임스탬프가 아니라 plan 단위 판정. 두 기기가 같은 목표의 *다른*
  // 항목을 거의 동시에 체크하면 더 오래된 plan 쪽 체크는 아직 유실될 수 있다. 완전 대칭은
  // PlanCheckItem에 updatedAt를 넣어야 함(일상 항목처럼) — 필요해지면 그때.
  return mergePlanPair(local, remote, newer === local)
}

/**
 * 목표 목록 병합 — 통짜 교체가 아니라 **목표별·항목별 합집합**이라 어느 기기의 목표·항목도
 * 사라지지 않는다. 같은 목표/항목의 충돌은 번들이 더 최신인 쪽(preferLocal)을 따른다.
 */
function mergePlans(local: GoalPlan[], remote: GoalPlan[], localRev: number, remoteRev: number): GoalPlan[] {
  const preferLocal = localRev >= remoteRev
  const byId = new Map<string, GoalPlan>()
  for (const plan of remote) byId.set(plan.id, plan)
  for (const plan of local) {
    const existing = byId.get(plan.id)
    byId.set(plan.id, existing ? mergePlanAtId(plan, existing, preferLocal) : plan)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 같은 id의 두 항목 중 최신을 고른다.
 * "시각"은 삭제(툼스톤)면 deletedAt, 아니면 updatedAt으로 본다. 더 나중이 이긴다:
 *   - 삭제가 더 나중 → 툼스톤이 이김(계속 지워진 채, 다른 기기에도 삭제 전파).
 *   - 편집이 더 나중 → 살아 있는 항목이 이김(삭제 뒤 다시 고쳤으면 되살아난다).
 * 둘 다 시각이 없으면(옛 데이터) 번들 단위 규칙(preferLocal)으로 물러난다.
 */
function itemTime(it: MiscTodoItem): number | undefined {
  return it.deletedAt ?? it.updatedAt
}

function pickNewerTodo(local: MiscTodoItem, remote: MiscTodoItem, preferLocal: boolean): MiscTodoItem {
  const lt = itemTime(local)
  const rt = itemTime(remote)
  if (lt != null && rt != null) return lt >= rt ? local : remote
  if (lt != null) return local
  if (rt != null) return remote
  return preferLocal ? local : remote
}

function mergeMiscTodos(
  local: MiscTodoItem[],
  remote: MiscTodoItem[],
  localRev: number,
  remoteRev: number,
): MiscTodoItem[] {
  const preferLocal = localRev >= remoteRev
  const byId = new Map<string, MiscTodoItem>()
  for (const item of remote) byId.set(item.id, item)
  for (const item of local) {
    const existing = byId.get(item.id)
    byId.set(item.id, existing ? pickNewerTodo(item, existing, preferLocal) : item)
  }
  return [...byId.values()]
}

/** 루틴도 id 기준 병합 — 최근에 바뀐 쪽을 우선한다 (할 일과 같은 규칙) */
function mergeRoutines(
  local: MiscRoutine[],
  remote: MiscRoutine[],
  localRev: number,
  remoteRev: number,
): MiscRoutine[] {
  const preferLocal = localRev >= remoteRev
  const byId = new Map<string, MiscRoutine>()
  for (const r of remote) byId.set(r.id, r)
  for (const r of local) {
    const existing = byId.get(r.id)
    if (!existing || preferLocal) byId.set(r.id, r)
  }
  return [...byId.values()]
}

export function mergeGoalDataBundles(local: GoalDataBundle, remote: GoalDataBundle): GoalDataBundle {
  const ownerId = remote.updatedAt >= local.updatedAt ? remote.ownerId : local.ownerId
  const updatedAt = Math.max(local.updatedAt, remote.updatedAt, Date.now())
  return {
    ownerId,
    plans: mergePlans(local.plans, remote.plans, local.updatedAt, remote.updatedAt),
    miscTodos: mergeMiscTodos(local.miscTodos, remote.miscTodos, local.updatedAt, remote.updatedAt),
    routines: mergeRoutines(local.routines, remote.routines, local.updatedAt, remote.updatedAt),
    updatedAt,
  }
}

export function remoteRowToBundle(row: RemoteGoalDataRow): GoalDataBundle {
  return {
    ownerId: row.owner_id,
    plans: Array.isArray(row.plans) ? (row.plans as GoalPlan[]) : [],
    miscTodos: Array.isArray(row.misc_todos) ? (row.misc_todos as MiscTodoItem[]) : [],
    routines: Array.isArray(row.routines) ? (row.routines as MiscRoutine[]) : [],
    updatedAt: row.updated_at,
  }
}

export async function pushLocalGoalData(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const local = loadLocalGoalDataBundle()

  // 올리기 전에 원격과 병합한다. 병합은 **항목별 최신 우선**(mergeMiscTodos가 항목 updatedAt을
  // 본다)이라, 이 기기의 방금 편집은 지키면서 다른 기기가 고친 항목도 흡수한다. 이걸 안 하면
  // "내 번들이 더 최신"인 기기가 상대의 변경을 통째로 덮어써 한 방향만 반영되는 버그가 난다.
  let bundle = local
  const userId = getActiveSyncUser()
  if (userId) {
    try {
      const remoteRow = await fetchRemoteGoalData(userId)
      if (remoteRow) {
        const merged = mergeGoalDataBundles(local, remoteRowToBundle(remoteRow))
        if (serializeGoalData(merged) !== serializeGoalData(local)) applyLocalGoalDataBundle(merged)
        bundle = merged
      }
    } catch {
      // 원격 조회 실패는 무시하고 로컬로 올린다 — 저장이 막히는 것보단 낫다
    }
  }

  const updatedAt = markGoalDataRevision()
  await pushGoalDataToCloud({
    ownerId: bundle.ownerId,
    plans: bundle.plans,
    miscTodos: bundle.miscTodos,
    routines: bundle.routines,
    updatedAt,
  })
  // 방금 올린 내용을 "클라우드에 있다고 아는 내용"으로 기록 → 실시간으로 되돌아와도 에코로 걸러진다.
  knownCloudContent = serializeGoalData(bundle)
  await syncRemindersToCloud(bundle.plans, bundle.miscTodos)
}

/**
 * 원격 행 하나를 로컬에 반영한다 (실시간 구독 콜백·캐치업 당김 공용).
 * 항목별 병합이라 방향 무관하게 안전하고, 에코(내가 올린 것)·무변화는 건너뛴다.
 */
export function applyRemoteGoalRow(row: RemoteGoalDataRow): void {
  const remote = remoteRowToBundle(row)
  const remoteContent = serializeGoalData(remote)
  if (remoteContent === knownCloudContent) return // 내가 올린 에코 or 이미 반영됨

  const local = loadLocalGoalDataBundle()
  const merged = mergeGoalDataBundles(local, remote)
  knownCloudContent = remoteContent // 이 원격 상태는 봤다고 기록 (반복 이벤트 무시)

  if (serializeGoalData(merged) === serializeGoalData(local)) return // 바뀐 게 없으면 안 쓴다
  applyLocalGoalDataBundle(merged)
}

/**
 * 원격을 한 번 당겨 반영한다. 앱이 (백그라운드에서) 돌아왔을 때 놓친 변경을 따라잡는 용도.
 * 실시간 구독이 끊겼던 구간을 메운다. 실패해도 조용히 넘어간다.
 */
export async function pullRemoteGoalDataOnce(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const userId = getActiveSyncUser()
  if (!userId) return
  try {
    const row = await fetchRemoteGoalData(userId)
    if (row) applyRemoteGoalRow(row)
  } catch {
    // 조회 실패는 무시 — 다음 기회에 다시 당긴다
  }
}

export function scheduleGoalDataSync(): void {
  if (isApplyingRemoteGoalData() || !isCloudSyncAvailable()) return
  markGoalDataRevision()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushLocalGoalData().catch(() => {})
  }, 800)
}

export async function syncGoalDataOnLogin(userId: string): Promise<'uploaded' | 'downloaded' | 'merged' | 'empty'> {
  const local = loadLocalGoalDataBundle()
  const remoteRow = await fetchRemoteGoalData(userId)
  const localHas = hasLocalGoalData()
  const remoteHas = remoteRow != null

  if (localHas && !remoteHas) {
    await pushLocalGoalData()
    return 'uploaded'
  }

  if (!localHas && remoteHas) {
    if (getGoalDataRevision() > 0) {
      await pushLocalGoalData()
      return 'uploaded'
    }
    const remote = remoteRowToBundle(remoteRow)
    applyLocalGoalDataBundle(remote)
    await syncRemindersToCloud(remote.plans, remote.miscTodos)
    return 'downloaded'
  }

  if (localHas && remoteHas) {
    const remote = remoteRowToBundle(remoteRow)
    if (remote.updatedAt > local.updatedAt) {
      const merged = mergeGoalDataBundles(local, remote)
      applyLocalGoalDataBundle(merged)
      await pushGoalDataToCloud({
        ownerId: merged.ownerId,
        plans: merged.plans,
        miscTodos: merged.miscTodos,
        routines: merged.routines,
        updatedAt: merged.updatedAt,
      })
      await syncRemindersToCloud(merged.plans, merged.miscTodos)
      return 'merged'
    }
    if (local.updatedAt > remote.updatedAt) {
      await pushLocalGoalData()
      return 'merged'
    }
    const merged = mergeGoalDataBundles(local, remote)
    applyLocalGoalDataBundle(merged)
    await pushGoalDataToCloud({
      ownerId: merged.ownerId,
      plans: merged.plans,
      miscTodos: merged.miscTodos,
      routines: merged.routines,
      updatedAt: merged.updatedAt,
    })
    await syncRemindersToCloud(merged.plans, merged.miscTodos)
    return 'merged'
  }

  return 'empty'
}
