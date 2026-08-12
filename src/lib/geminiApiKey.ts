import { AI_PROXY_KEY, isAiProxyConfigured } from './aiProxy'
import { loadStoredApiKey } from './storage'

const DEV_MODE_KEY = 'futureme-dev-mode'

/**
 * AI를 부를 때 쓸 자격. **앱에 키를 내장하지 않는다.**
 *
 * 1순위: 이 기기에 저장된 사용자 키 (개발자 모드에서 넣은 것)
 * 2순위: 서버 프록시 — 유저는 키 없이 로그인만으로 쓴다
 *
 * `VITE_GEMINI_API_KEY`로 빌드에 키를 박는 방법은 쓰지 않는다. Vite는 그 값을
 * 빌드 결과물에 글자 그대로 넣어서, 앱 파일을 열거나 네트워크 요청을 보면
 * 키가 그대로 보인다(요청 주소에 `?key=`로 붙는다).
 *
 * 키를 읽는 곳이 여기 하나뿐인 게 중요하다 — 채팅·온보딩·플래너·미래비전·알람이
 * 모두 이 함수를 부르므로, 조달 방식을 바꿀 때 이 함수만 고치면 된다.
 */
export function resolveEffectiveApiKey(): string {
  const stored = loadStoredApiKey()?.trim()
  if (stored) return stored
  if (isAiProxyConfigured()) return AI_PROXY_KEY
  return ''
}

/** 프록시를 쓰는 중인가 (사용자 키 없이) — 설정 화면 표시용 */
export function isUsingAiProxy(): boolean {
  return resolveEffectiveApiKey() === AI_PROXY_KEY
}

export function hasEffectiveApiKey(): boolean {
  return resolveEffectiveApiKey().length > 0
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
