import type { GoalPlan } from '../types/goalPlan'
import { GOAL_PLAN_TEMPLATE_VERSION } from '../types/goalPlan'
import type { SelfProfile } from '../types/self'
import { mergeMotivationAnswers, recoverPlansMotivation } from './goalMotivationRecovery'
import { hydratePlansFromSections } from './goalSectionHydration'
import { repairDuplicateHierarchyItemIds } from './goalHierarchyMutations'
import { restoreGoalPlansFromSnapshot, writeGoalPlanSnapshot } from './goalPlanSnapshot'
import { migrateGoalPlan } from './goalTemplateEngine'
import { isApplyingRemoteGoalData } from './goalDataSyncState'

const CURRENT_PREFIX = 'goal-plans-'
/** 채팅 앱 시절 저장 키 */
const LEGACY_PREFIX = 'futureme-goal-plans-'

const key = (profileId: string) => `${CURRENT_PREFIX}${profileId}`

/** 툼스톤을 이 기간(ms)보다 오래 두지 않는다 — 그쯤이면 모든 기기가 삭제를 받아갔다고 본다 */
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60일

function isActivePlan(plan: GoalPlan): boolean {
  return plan.deletedAt == null
}

function toPlanTombstone(plan: GoalPlan): GoalPlan {
  const now = Date.now()
  return { ...plan, title: '', deletedAt: now, updatedAt: new Date(now).toISOString() }
}

function prunePlanTombstones(plans: GoalPlan[]): GoalPlan[] {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  const pruned = plans.filter((p) => !(p.deletedAt != null && p.deletedAt < cutoff))
  return pruned.length === plans.length ? plans : pruned
}

function parsePlansRaw(raw: string | null): GoalPlan[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as GoalPlan[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 채팅 앱 프로필 ID — futureme-goal-plans-{id} 키 복구용 */
function chatProfileIds(): string[] {
  try {
    const raw = localStorage.getItem('futureme-profiles-index')
    if (!raw) return []
    const list = JSON.parse(raw) as { id?: string }[]
    if (!Array.isArray(list)) return []
    return list.map((p) => p.id).filter((id): id is string => !!id)
  } catch {
    return []
  }
}

/** 다른 localStorage 키에 남아 있는 목표 수집 (구 채팅 프로필·이전 owner ID 등) */
function scanExternalPlanSources(excludeKey: string): GoalPlan[] {
  const found: GoalPlan[] = []
  const seen = new Set<string>()

  const keysToTry = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey) continue
    const fromLegacy = storageKey.startsWith(LEGACY_PREFIX)
    const fromOtherOwner = storageKey.startsWith(CURRENT_PREFIX) && storageKey !== excludeKey
    if (fromLegacy || fromOtherOwner) keysToTry.add(storageKey)
  }
  for (const profileId of chatProfileIds()) {
    keysToTry.add(`${LEGACY_PREFIX}${profileId}`)
  }

  for (const storageKey of keysToTry) {
    for (const plan of parsePlansRaw(localStorage.getItem(storageKey))) {
      if (!plan?.id || seen.has(plan.id)) continue
      seen.add(plan.id)
      found.push(plan)
    }
  }

  return found
}

function migrateList(list: GoalPlan[], profileId: string, profile?: SelfProfile): GoalPlan[] {
  return list.map((p) => migrateGoalPlan({ ...p, profileId }, profile))
}

function repairPlansItemIds(plans: GoalPlan[]): { plans: GoalPlan[]; changed: boolean } {
  let changed = false
  const next = plans.map((p) => {
    const repaired = repairDuplicateHierarchyItemIds(p)
    if (repaired.changed) changed = true
    return repaired.plan
  })
  return { plans: next, changed }
}

function needsPersistMigration(before: GoalPlan[], after: GoalPlan[]): boolean {
  return before.some((p, i) => {
    const m = after[i]
    return (
      p.templateVersion !== GOAL_PLAN_TEMPLATE_VERSION ||
      !p.hierarchy ||
      m.hierarchy !== p.hierarchy
    )
  })
}

function saveAll(profileId: string, plans: GoalPlan[]): void {
  const pruned = prunePlanTombstones(plans)
  localStorage.setItem(key(profileId), JSON.stringify(pruned))
  writeGoalPlanSnapshot(profileId, pruned.filter(isActivePlan))
  if (!isApplyingRemoteGoalData()) {
    void import('./goalDataSync').then(({ scheduleGoalDataSync }) => scheduleGoalDataSync())
  }
}

/** 구 저장소 → 현재 owner 키로 병합 (최초 1회 마이그레이션만) */
function mergeExternalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  const storageKey = key(profileId)
  const raw = localStorage.getItem(storageKey)
  const current = parsePlansRaw(raw)

  // 이미 현재 키에 저장된 적 있으면(빈 배열 포함) 그게 정본 — legacy에서 삭제한 목표를 되살리지 않는다
  if (raw !== null) {
    if (!current.length) return []
    let merged = migrateList(current, profileId, profile).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
    const recovered = recoverPlansMotivation(merged)
    merged = recovered.plans
    const hydrated = hydratePlansFromSections(merged)
    merged = hydrated.plans
    const repaired = repairPlansItemIds(merged)
    merged = repaired.plans
    if (
      recovered.changed ||
      hydrated.changed ||
      repaired.changed ||
      needsPersistMigration(current, merged)
    ) {
      saveAll(profileId, merged)
    }
    return merged
  }

  const external = scanExternalPlanSources(storageKey)

  if (!external.length) {
    const fromSnapshot = restoreGoalPlansFromSnapshot(profileId)
    if (fromSnapshot?.length) {
      saveAll(profileId, migrateList(fromSnapshot, profileId, profile))
      return loadGoalPlans(profileId, profile)
    }
    return []
  }

  const byId = new Map<string, GoalPlan>()
  for (const plan of external) byId.set(plan.id, { ...plan, profileId })
  for (const plan of current) {
    const existing = byId.get(plan.id)
    byId.set(plan.id, {
      ...plan,
      motivation: mergeMotivationAnswers(existing?.motivation, plan.motivation),
    })
  }

  let merged = migrateList([...byId.values()], profileId, profile).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )

  const recovered = recoverPlansMotivation(merged)
  merged = recovered.plans

  const hydrated = hydratePlansFromSections(merged)
  merged = hydrated.plans
  const repaired = repairPlansItemIds(merged)
  merged = repaired.plans

  if (
    merged.length !== current.length ||
    external.length > 0 ||
    recovered.changed ||
    hydrated.changed ||
    repaired.changed ||
    needsPersistMigration(current, merged)
  ) {
    saveAll(profileId, merged)
  }

  return merged
}

function loadAllGoalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  try {
    return mergeExternalPlans(profileId, profile)
  } catch {
    return []
  }
}

/** 화면·편집용 — 삭제(툼스톤)된 목표는 제외 */
export function loadGoalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  return loadAllGoalPlans(profileId, profile).filter(isActivePlan)
}

/** 동기화용 — 툼스톤 포함 전체 */
export function loadGoalPlansForSync(profileId: string, profile?: SelfProfile): GoalPlan[] {
  return loadAllGoalPlans(profileId, profile)
}

export function saveGoalPlan(plan: GoalPlan): void {
  const list = loadAllGoalPlans(plan.profileId).filter((p) => p.id !== plan.id)
  list.unshift({ ...plan, deletedAt: undefined, updatedAt: new Date().toISOString() })
  saveAll(plan.profileId, list)
}

export function deleteGoalPlan(profileId: string, planId: string): void {
  const list = loadAllGoalPlans(profileId).map((p) =>
    p.id === planId && isActivePlan(p) ? toPlanTombstone(p) : p,
  )
  saveAll(profileId, list)
}

export function touchGoalPlan(_profileId: string, plan: GoalPlan): GoalPlan {
  const next = { ...plan, updatedAt: new Date().toISOString() }
  saveGoalPlan(next)
  return next
}
