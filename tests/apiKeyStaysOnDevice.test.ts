// Gemini API 키는 이 기기에만 둔다 — 두 방향 모두 막혀 있어야 한다.
//   1) 앱 → 클라우드: futureme_settings.gemini_api_key 에 평문으로 올라가던 것
//   2) 빌드 → 앱: VITE_GEMINI_API_KEY 로 앱에 박던 것 (빌드 결과물에서 그대로 보인다)
import { beforeEach, describe, expect, test } from 'bun:test'

// 테스트 환경(bun)에는 브라우저의 localStorage가 없으므로 메모리 구현으로 대체한다.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}
globalThis.localStorage = new MemoryStorage()

import { resolveEffectiveApiKey } from '../src/lib/geminiApiKey'
import { buildSettingsCloudPayload, syncSettingsOnLogin } from '../src/lib/settingsSync'
import { loadStoredApiKey, saveApiKey } from '../src/lib/storage'

const SECRET = 'AIzaSy-test-only-not-a-real-key'

describe('API 키는 기기 밖으로 나가지 않는다', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('업로드 payload에 키가 없다', () => {
    saveApiKey(SECRET)
    const payload = buildSettingsCloudPayload()
    expect(JSON.stringify(payload)).not.toContain(SECRET)
    expect(Object.keys(payload).sort()).toEqual(['geminiModel', 'updatedAt'])
  })

  test('로그인 동기화가 이 기기의 키를 지우지 않는다', async () => {
    saveApiKey(SECRET)
    await syncSettingsOnLogin('user-1')
    expect(loadStoredApiKey()).toBe(SECRET)
  })
})

describe('앱에 키를 내장하지 않는다', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('저장된 키가 없으면 빈 값이다 (빌드 내장 키로 대체되지 않는다)', () => {
    expect(resolveEffectiveApiKey()).toBe('')
  })

  test('소스에 VITE_GEMINI_API_KEY 참조가 없다', async () => {
    // 있으면 Vite가 빌드 결과물에 값을 글자 그대로 넣는다.
    const files = ['src/lib/geminiApiKey.ts', 'src/lib/storage.ts', 'src/lib/settingsSync.ts']
    for (const f of files) {
      const text = await Bun.file(f).text()
      expect(text).not.toContain('import.meta.env.VITE_GEMINI_API_KEY')
    }
  })
})
