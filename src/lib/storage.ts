import type { SelfProfile, ChatMessage } from '../types/self'
import { emptyFutureSelf, normalizeFutureSelf, normalizePlanner } from '../types/self'
import { resolveModel } from './selfEngine'
import { formatListPreview } from './chatDisplay'
import { buildDefaultListPreview } from './profileSummary'
import {
  deleteChatFromDb,
  loadChatFromDb,
  loadLegacyChatFromDb,
  saveChatToDb,
  clearLegacyChatDb,
} from './chatDb'
import { clearProfilePhotos } from './profilePhotos'
import { isCloudSyncAvailable, pushProfileToCloud, pushChatToCloud, tombstoneProfileInCloud } from './cloudSync'

/** 구버전 localStorage 키 (`aime-*` — 초기 프로젝트명 시절) */
const LEGACY_PROFILE_KEY = 'aime-self-profile'
const LEGACY_CHAT_KEY = 'aime-self-chat'
const LEGACY_INDEX_KEY = 'aime-profiles-index'
const LEGACY_API_KEY_KEY = 'aime-gemini-key'
const LEGACY_MODEL_KEY = 'aime-gemini-model'
const LEGACY_PROFILE_PREFIX = 'aime-profile-'

const INDEX_KEY = 'futureme-profiles-index'
const API_KEY_KEY = 'futureme-gemini-key'
const MODEL_KEY = 'futureme-gemini-model'
const SETTINGS_UPDATED_KEY = 'futureme-settings-updated-at'
const API_CHECK_CACHE_KEY = 'futureme-api-check-cache'
// v6: 온보딩이 질문 하나=화면 하나에서 **4페이지 묶음**으로 바뀜.
//     저장하던 값이 stepIdx(몇 번째 질문)에서 pageIdx(몇 번째 장)로 달라져서,
//     구버전 중간 저장을 그대로 읽으면 엉뚱한 화면으로 간다. 키를 갈아 폐기한다.
//     (이미 온보딩을 마친 프로필은 영향 없음 — 여긴 '하다 만' 진행 상태만 산다)
export const ONBOARDING_PROGRESS_KEY = 'futureme-onboarding-v6'
export const ONBOARDING_PROGRESS_VERSION = 6

/**
 * 온보딩 중간 저장에서 **두 곳이 같이 읽는 부분**.
 *
 * App은 "이어서 만들기?"를 물을지 정하려고 읽고, 온보딩 화면은 어디서부터 이어갈지
 * 정하려고 읽는다. 이 이름이 한쪽만 바뀌면 확인 창이 안 뜨고 진행이 **조용히 지워진다** —
 * 실제로 stepIdx → pageIdx로 바꾸다 그렇게 됐다. 같은 타입을 쓰게 해서 컴파일러가 잡는다.
 */
export interface OnboardingProgressHead {
  version?: number
  pageIdx?: number
}
const ONBOARDING_KEY = ONBOARDING_PROGRESS_KEY

/** TalkBack / 구 aime-* 마이그레이션 */
const LEGACY_TALKBACK_INDEX = 'talkback-profiles-index'
const LEGACY_TALKBACK_API_KEY = 'talkback-gemini-key'
const LEGACY_TALKBACK_MODEL = 'talkback-gemini-model'
const LEGACY_TALKBACK_PROFILE_PREFIX = 'talkback-profile-'
const LEGACY_AIME_API_KEY = 'aime-gemini-key'
const LEGACY_AIME_MODEL = 'aime-gemini-model'

export interface ProfileSummary {
  id: string
  name: string
  preview: string
  updatedAt: number
}

const profileKey = (id: string) => `futureme-profile-${id}`

// ---------------------------------------------------------------------------
// 삭제 기록 (tombstone) — "지운 것이 되살아나면 안 된다"
// 삭제한 프로필 ID와 삭제 시각을 기억해 두고, 동기화 병합 때 클라우드 복사본이
// 삭제보다 오래됐으면 다시 내려받지 않는다. (syncOrchestrator에서 사용)
// ---------------------------------------------------------------------------

const TOMBSTONE_KEY = 'futureme-profile-tombstones'
/** 이보다 오래된 tombstone은 정리 — localStorage가 무한히 쌓이지 않게 */
const TOMBSTONE_TTL_MS = 1000 * 60 * 60 * 24 * 180

export function loadProfileTombstones(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, unknown>
    const cutoff = Date.now() - TOMBSTONE_TTL_MS
    const valid: Record<string, number> = {}
    let dropped = false
    for (const [id, at] of Object.entries(data)) {
      if (typeof at === 'number' && at >= cutoff) valid[id] = at
      else dropped = true
    }
    if (dropped) localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(valid))
    return valid
  } catch {
    return {}
  }
}

export function addProfileTombstone(id: string, deletedAt = Date.now()): void {
  try {
    const data = loadProfileTombstones()
    data[id] = deletedAt
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

export function removeProfileTombstone(id: string): void {
  try {
    const data = loadProfileTombstones()
    if (!(id in data)) return
    delete data[id]
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

function migrateLegacyStorageKeys(): void {
  const copyIfMissing = (from: string, to: string) => {
    if (!localStorage.getItem(to)) {
      const value = localStorage.getItem(from)
      if (value) localStorage.setItem(to, value)
    }
  }

  copyIfMissing(LEGACY_INDEX_KEY, INDEX_KEY)
  copyIfMissing(LEGACY_TALKBACK_INDEX, INDEX_KEY)
  copyIfMissing(LEGACY_API_KEY_KEY, API_KEY_KEY)
  copyIfMissing(LEGACY_TALKBACK_API_KEY, API_KEY_KEY)
  copyIfMissing(LEGACY_AIME_API_KEY, API_KEY_KEY)
  copyIfMissing(LEGACY_MODEL_KEY, MODEL_KEY)
  copyIfMissing(LEGACY_TALKBACK_MODEL, MODEL_KEY)
  copyIfMissing(LEGACY_AIME_MODEL, MODEL_KEY)
  // 온보딩 진행은 단계 구조가 바뀔 때마다 새 키로 시작 — 구버전 이어하기는 하지 않음

  for (const prefix of [LEGACY_PROFILE_PREFIX, LEGACY_TALKBACK_PROFILE_PREFIX]) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const id = key.slice(prefix.length)
      copyIfMissing(key, profileKey(id))
    }
  }
}

// ---------------------------------------------------------------------------
// 멀티 프로필
// ---------------------------------------------------------------------------

export function loadProfileSummaries(): ProfileSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ProfileSummary[]
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function saveProfileSummaries(list: ProfileSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function loadProfileById(id: string): SelfProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SelfProfile
    if (!parsed.future) parsed.future = emptyFutureSelf()
    else parsed.future = normalizeFutureSelf(parsed.future)
    parsed.planner = normalizePlanner(parsed.planner)
    return parsed
  } catch {
    return null
  }
}

function profileFallbackTime(profile: SelfProfile): number {
  if (profile.completedAt) {
    const t = Date.parse(profile.completedAt)
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

export function saveProfileRecord(
  profile: SelfProfile,
  preview?: string,
  lastMessageAt?: number,
): void {
  if (!profile.id) throw new Error('profile.id required')
  // 같은 ID를 다시 저장하면(백업 복원 등) 삭제 기록을 지워 부활시킨다
  removeProfileTombstone(profile.id)
  localStorage.setItem(profileKey(profile.id), JSON.stringify(profile))

  const summaries = loadProfileSummaries()
  const idx = summaries.findIndex((s) => s.id === profile.id)
  const fallbackPreview =
    (preview?.trim() ? formatListPreview(preview) : '') ||
    buildDefaultListPreview(profile)

  if (idx >= 0) {
    summaries[idx] = {
      id: profile.id,
      name: profile.name || '이름 없음',
      preview: preview?.trim() ? formatListPreview(preview) : summaries[idx].preview || fallbackPreview,
      updatedAt: lastMessageAt ?? summaries[idx].updatedAt,
    }
  } else {
    summaries.unshift({
      id: profile.id,
      name: profile.name || '이름 없음',
      preview: fallbackPreview,
      updatedAt: lastMessageAt ?? profileFallbackTime(profile),
    })
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  saveProfileSummaries(summaries)
  if (isCloudSyncAvailable()) {
    const summary = summaries.find((s) => s.id === profile.id)
    const updatedAt = summary?.updatedAt ?? Date.now()
    const prev = summary?.preview ?? preview ?? ''
    void pushProfileToCloud(profile, prev, updatedAt).catch(() => {})
  }
}

/** 목록 미리보기·시간 = 마지막 메시지 기준 (카톡과 동일) */
export function updateProfilePreview(id: string, preview: string, lastMessageAt: number): void {
  const summaries = loadProfileSummaries()
  const idx = summaries.findIndex((s) => s.id === id)
  if (idx < 0) return
  summaries[idx].preview = formatListPreview(preview)
  summaries[idx].updatedAt = lastMessageAt
  summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  saveProfileSummaries(summaries)
}

/** 이 기기에서만 삭제 — tombstone·클라우드는 건드리지 않는다 (동기화 병합용) */
export async function deleteProfileLocally(id: string): Promise<void> {
  localStorage.removeItem(profileKey(id))
  localStorage.removeItem(chatRevisionKey(id))
  clearProfilePhotos(id)
  saveProfileSummaries(loadProfileSummaries().filter((s) => s.id !== id))
  chatLoadCache.delete(id)
  await deleteChatFromDb(id)
}

export async function deleteProfileRecord(id: string): Promise<void> {
  const deletedAt = Date.now()
  // 클라우드 기록이 실패해도(오프라인 등) 다음 동기화에서 재시도할 수 있게 먼저 남긴다
  addProfileTombstone(id, deletedAt)
  await deleteProfileLocally(id)
  if (isCloudSyncAvailable()) void tombstoneProfileInCloud(id, deletedAt).catch(() => {})
}

/** @deprecated — loadProfileById 사용 */
export function loadProfile(): SelfProfile | null {
  const summaries = loadProfileSummaries()
  if (summaries.length) return loadProfileById(summaries[0].id)
  try {
    const raw = localStorage.getItem(LEGACY_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as SelfProfile) : null
  } catch {
    return null
  }
}

/** @deprecated — saveProfileRecord 사용 */
export function saveProfile(profile: SelfProfile): void {
  saveProfileRecord(profile)
}

/** @deprecated — deleteProfileRecord 사용 */
export function clearProfile(): void {
  const summaries = loadProfileSummaries()
  for (const s of summaries) {
    localStorage.removeItem(profileKey(s.id))
    void deleteChatFromDb(s.id)
  }
  saveProfileSummaries([])
  localStorage.removeItem(LEGACY_PROFILE_KEY)
  localStorage.removeItem(LEGACY_CHAT_KEY)
  chatLoadCache.clear()
  void clearLegacyChatDb()
}

// ---------------------------------------------------------------------------
// 단일 → 멀티 마이그레이션
// ---------------------------------------------------------------------------

let migratePromise: Promise<void> | null = null

export function ensureMigrated(): Promise<void> {
  migrateLegacyStorageKeys()
  if (!migratePromise) migratePromise = runMigration()
  return migratePromise
}

async function runMigration(): Promise<void> {
  if (loadProfileSummaries().length > 0) return

  const legacyRaw = localStorage.getItem(LEGACY_PROFILE_KEY)
  if (!legacyRaw) return

  try {
    const profile = JSON.parse(legacyRaw) as SelfProfile
    profile.id = profile.id || crypto.randomUUID()

    let messages: ChatMessage[] = await loadLegacyChatFromDb()
    if (!messages.length) {
      try {
        const chatRaw = localStorage.getItem(LEGACY_CHAT_KEY)
        if (chatRaw) messages = JSON.parse(chatRaw) as ChatMessage[]
      } catch {
        /* ignore */
      }
    }

    if (messages.length) {
      await saveChatToDb(profile.id, messages)
      const last = messages[messages.length - 1]
      saveProfileRecord(profile, last.content.slice(0, 80), last.timestamp)
    } else {
      saveProfileRecord(profile, undefined, profileFallbackTime(profile))
    }

    localStorage.removeItem(LEGACY_PROFILE_KEY)
    localStorage.removeItem(LEGACY_CHAT_KEY)
    await clearLegacyChatDb()
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Chat — 프로필별 IndexedDB
// ---------------------------------------------------------------------------

const chatLoadCache = new Map<string, Promise<ChatMessage[]>>()

function chatRevisionKey(profileId: string): string {
  return `futureme-chat-rev-${profileId}`
}

export function getLocalChatRevision(profileId: string): number {
  try {
    return Number(localStorage.getItem(chatRevisionKey(profileId)) || 0)
  } catch {
    return 0
  }
}

function setLocalChatRevision(profileId: string, ts: number): void {
  try {
    localStorage.setItem(chatRevisionKey(profileId), String(ts))
  } catch {
    /* ignore */
  }
}

export function touchProfilePreviewOnly(profileId: string, preview: string): void {
  const summaries = loadProfileSummaries()
  const idx = summaries.findIndex((s) => s.id === profileId)
  if (idx < 0) return
  summaries[idx].preview = formatListPreview(preview)
  saveProfileSummaries(summaries)
}

/** IndexedDB 채팅 기록 기준으로 목록 시간·미리보기 보정 */
export async function reconcileProfileSummariesFromChats(): Promise<void> {
  const summaries = loadProfileSummaries()
  if (!summaries.length) return

  let changed = false
  const next = [...summaries]

  for (let i = 0; i < next.length; i++) {
    const s = next[i]
    const messages = await loadChatFromDb(s.id)
    if (!messages.length) continue

    const last = messages[messages.length - 1]
    const preview = formatListPreview(last.content)
    if (s.updatedAt !== last.timestamp || s.preview !== preview) {
      next[i] = { ...s, updatedAt: last.timestamp, preview }
      changed = true
    }
  }

  if (changed) {
    next.sort((a, b) => b.updatedAt - a.updatedAt)
    saveProfileSummaries(next)
  }
}

export function invalidateChatLoadCache(profileId?: string): void {
  if (profileId) chatLoadCache.delete(profileId)
  else chatLoadCache.clear()
}

export function loadChatAsync(profileId: string): Promise<ChatMessage[]> {
  if (!chatLoadCache.has(profileId)) {
    chatLoadCache.set(
      profileId,
      loadChatFromDb(profileId).then((msgs) => {
        chatLoadCache.set(profileId, Promise.resolve(msgs))
        return msgs
      }),
    )
  }
  return chatLoadCache.get(profileId)!
}

export async function saveChatAsync(
  profileId: string,
  messages: ChatMessage[],
  options?: { pushCloud?: boolean; revision?: number },
): Promise<void> {
  const revision = options?.revision ?? Date.now()
  await saveChatToDb(profileId, messages)
  chatLoadCache.set(profileId, Promise.resolve(messages))
  setLocalChatRevision(profileId, revision)
  if (messages.length) {
    const last = messages[messages.length - 1]
    updateProfilePreview(profileId, last.content, last.timestamp)
  } else {
    touchProfilePreviewOnly(profileId, '미래의 나에게 먼저 말을 걸어보세요')
  }
  if (options?.pushCloud !== false && isCloudSyncAvailable()) {
    await pushChatToCloud(profileId, messages, revision).catch(() => {})
  }
}

export function saveChat(profileId: string, messages: ChatMessage[]): void {
  void saveChatAsync(profileId, messages)
}

// ---------------------------------------------------------------------------
// 백업 내보내기 / 가져오기
// ---------------------------------------------------------------------------

export const BACKUP_VERSION = 1 as const

export interface FutureMeBackup {
  version: typeof BACKUP_VERSION
  exportedAt: string
  profile: SelfProfile
  messages: ChatMessage[]
}

export function buildBackup(profile: SelfProfile, messages: ChatMessage[]): FutureMeBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    messages,
  }
}

export function parseBackup(raw: string): FutureMeBackup | null {
  try {
    const data = JSON.parse(raw) as Partial<FutureMeBackup>
    if (data.version !== BACKUP_VERSION) return null
    if (!data.profile || typeof data.profile !== 'object') return null
    if (!Array.isArray(data.messages)) return null
    if (!data.profile.name || !data.profile.completedAt) return null
    return data as FutureMeBackup
  } catch {
    return null
  }
}

export async function applyBackup(backup: FutureMeBackup, targetId?: string): Promise<string> {
  const profile = {
    ...backup.profile,
    id: targetId || backup.profile.id || crypto.randomUUID(),
  }
  saveProfileRecord(
    profile,
    backup.messages.length ? backup.messages[backup.messages.length - 1].content.slice(0, 80) : undefined,
    backup.messages.length
      ? backup.messages[backup.messages.length - 1].timestamp
      : profileFallbackTime(profile),
  )
  await saveChatAsync(profile.id, backup.messages)
  return profile.id
}

export function downloadBackup(profile: SelfProfile, messages: ChatMessage[]): void {
  const backup = buildBackup(profile, messages)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = (profile.name || 'futureme').replace(/[^\w가-힣.-]/g, '')
  a.href = url
  a.download = `catchme-backup-${safeName}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// API 키 · 모델 (전역)
// ---------------------------------------------------------------------------

/** 사용자가 직접 입력·저장한 키만 (내장 키 미포함) */
export function loadStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY)
}

/** @deprecated API 호출은 resolveEffectiveApiKey() 사용 */
export function loadApiKey(): string | null {
  return loadStoredApiKey()
}

export function saveApiKeyLocal(key: string): void {
  localStorage.setItem(API_KEY_KEY, key)
}

export function saveApiKey(key: string): void {
  saveApiKeyLocal(key)
  setSettingsUpdatedAt(Date.now())
  void import('./settingsSync').then(({ scheduleSettingsSync }) => {
    scheduleSettingsSync()
  })
}

export function loadSettingsUpdatedAt(): number {
  return Number(localStorage.getItem(SETTINGS_UPDATED_KEY) || 0)
}

export function setSettingsUpdatedAt(ts: number): void {
  localStorage.setItem(SETTINGS_UPDATED_KEY, String(ts))
}

export function loadModel(): string | null {
  const raw = localStorage.getItem(MODEL_KEY)
  if (!raw) return null
  const resolved = resolveModel(raw)
  if (resolved !== raw.trim()) {
    saveModelLocal(resolved)
    try {
      sessionStorage.setItem('futureme-model-migrated-from', raw.trim())
    } catch {
      /* ignore */
    }
    void import('./settingsSync').then(({ scheduleSettingsSync }) => {
      scheduleSettingsSync()
    })
  }
  return resolved
}

export function saveModelLocal(model: string): void {
  localStorage.setItem(MODEL_KEY, resolveModel(model))
}

export function saveModel(model: string): void {
  saveModelLocal(model)
  setSettingsUpdatedAt(Date.now())
  void import('./settingsSync').then(({ scheduleSettingsSync }) => {
    scheduleSettingsSync()
  })
}

// ---------------------------------------------------------------------------
// API 키 검증 결과 (저장 시 캐시 — 탭 전환·재진입 후에도 표시)
// ---------------------------------------------------------------------------

export type StoredApiCheckStatus = 'ok' | 'bad_key' | 'rate_limit' | 'error'

export type ApiCheckCache = {
  status: StoredApiCheckStatus
  keyFingerprint: string
  model: string
  checkedAt: number
}

export function apiKeyFingerprint(key: string): string {
  const k = key.trim()
  if (!k) return ''
  return `${k.length}:${k.slice(-4)}`
}

export function loadApiCheckCache(): ApiCheckCache | null {
  try {
    const raw = localStorage.getItem(API_CHECK_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<ApiCheckCache>
    if (
      !data.status ||
      !data.keyFingerprint ||
      !data.model ||
      typeof data.checkedAt !== 'number'
    ) {
      return null
    }
    return data as ApiCheckCache
  } catch {
    return null
  }
}

/** 저장된 키·모델과 캐시가 일치하면 마지막 검증 결과 반환 */
export function resolveCachedApiStatus(key: string, model: string): StoredApiCheckStatus | 'idle' {
  const cache = loadApiCheckCache()
  const fp = apiKeyFingerprint(key)
  if (!cache || !fp) return 'idle'
  if (cache.keyFingerprint !== fp || cache.model !== model.trim()) return 'idle'
  return cache.status
}

export function saveApiCheckCache(status: StoredApiCheckStatus, key: string, model: string): void {
  try {
    const entry: ApiCheckCache = {
      status,
      keyFingerprint: apiKeyFingerprint(key),
      model: model.trim(),
      checkedAt: Date.now(),
    }
    localStorage.setItem(API_CHECK_CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* ignore */
  }
}

export function clearApiCheckCache(): void {
  localStorage.removeItem(API_CHECK_CACHE_KEY)
}

export function resetAll(): void {
  void clearProfile()
  localStorage.removeItem(API_KEY_KEY)
  localStorage.removeItem(MODEL_KEY)
  localStorage.removeItem(API_CHECK_CACHE_KEY)
}

// 온보딩 중간 진행 (새 프로필 만들 때만)
export function saveOnboardingProgress(data: unknown): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

export function loadOnboardingProgress<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearOnboardingProgress(): void {
  localStorage.removeItem(ONBOARDING_KEY)
}

export function formatListTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (isToday) {
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear) {
    return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
  }
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })
}
