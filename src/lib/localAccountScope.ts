import { clearAllChatsFromDb } from './chatDb'
import { clearPrimaryProfileId } from './primaryProfile'
import { invalidateChatLoadCache } from './storage'

/** 마지막으로 동기화한 Supabase user id — 계정 전환 감지용 */
const LAST_AUTH_USER_KEY = 'futureme-last-auth-user-id'

const LOCAL_KEY_PREFIXES = [
  'futureme-',
  'goal-plans-',
  'goal-misc-todos-',
  'goal-misc-routines-',
  'aime-',
  'talkback-',
] as const

const LOCAL_EXACT_KEYS = new Set(['goal-app-owner-id'])

function shouldRemoveLocalKey(key: string): boolean {
  if (key === LAST_AUTH_USER_KEY) return false
  if (LOCAL_EXACT_KEYS.has(key)) return true
  return LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function getLastAuthUserId(): string | null {
  try {
    return localStorage.getItem(LAST_AUTH_USER_KEY)
  } catch {
    return null
  }
}

export function setLastAuthUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_AUTH_USER_KEY, userId)
  } catch {
    /* ignore */
  }
}

export function clearLastAuthUserId(): void {
  try {
    localStorage.removeItem(LAST_AUTH_USER_KEY)
  } catch {
    /* ignore */
  }
}

/** 다른 계정으로 로그인할 때 — 기기에 남아 있던 이전 계정 캐시를 비운다 */
export async function clearLocalAppData(): Promise<void> {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && shouldRemoveLocalKey(key)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }

  try {
    const sessKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('futureme_last_full_sync_')) sessKeys.push(key)
    }
    for (const key of sessKeys) sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }

  clearPrimaryProfileId()
  invalidateChatLoadCache()
  await clearAllChatsFromDb()
}
