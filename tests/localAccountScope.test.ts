import { describe, expect, test } from 'bun:test'

/** localAccountScope.ts 와 동일 규칙 — 키 필터 회귀 방지 */
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

describe('localAccountScope key filter', () => {
  test('계정 전환 추적 키는 지우지 않는다', () => {
    expect(shouldRemoveLocalKey(LAST_AUTH_USER_KEY)).toBe(false)
  })

  test('앱 데이터 키는 지운다', () => {
    expect(shouldRemoveLocalKey('futureme-profiles-index')).toBe(true)
    expect(shouldRemoveLocalKey('goal-plans-abc')).toBe(true)
    expect(shouldRemoveLocalKey('goal-app-owner-id')).toBe(true)
  })
})
