import { loadStoredApiKey } from './storage'

const DEV_MODE_KEY = 'futureme-dev-mode'

const builtInGeminiApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

export function getBuiltInGeminiApiKey(): string {
  return builtInGeminiApiKey
}

export function hasBuiltInGeminiApiKey(): boolean {
  return builtInGeminiApiKey.length > 0
}

/** localStorage 사용자 키 → 없으면 빌드 시 내장 키 */
export function resolveEffectiveApiKey(): string {
  const stored = loadStoredApiKey()?.trim()
  if (stored) return stored
  return builtInGeminiApiKey
}

export function hasEffectiveApiKey(): boolean {
  return resolveEffectiveApiKey().length > 0
}

export function isUsingBuiltInApiKey(): boolean {
  return !loadStoredApiKey()?.trim() && hasBuiltInGeminiApiKey()
}

export function isDeveloperMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function setDeveloperMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEV_MODE_KEY, '1')
    else localStorage.removeItem(DEV_MODE_KEY)
  } catch {
    /* ignore */
  }
}

const DEV_UNLOCK_TAPS = 7
const DEV_UNLOCK_RESET_MS = 2500

let devUnlockTapCount = 0
let devUnlockResetTimer: ReturnType<typeof setTimeout> | null = null

/** 설정 제목 등을 연속 탭 — true면 개발자 모드 방금 켜짐 */
export function registerDeveloperModeUnlockTap(): boolean {
  devUnlockTapCount += 1
  if (devUnlockResetTimer) clearTimeout(devUnlockResetTimer)
  devUnlockResetTimer = setTimeout(() => {
    devUnlockTapCount = 0
  }, DEV_UNLOCK_RESET_MS)

  if (devUnlockTapCount >= DEV_UNLOCK_TAPS) {
    devUnlockTapCount = 0
    setDeveloperMode(true)
    return true
  }
  return false
}

export function maskApiKeyTail(key: string): string {
  if (!key) return ''
  if (key.length <= 4) return '•'.repeat(key.length)
  return `···${key.slice(-4)}`
}
