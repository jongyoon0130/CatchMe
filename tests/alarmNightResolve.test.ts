// 밤 다짐 → 아침 해제 문구 연결의 기반 테스트.
// 핵심 보장: 알람에 다짐(resolve)이 있으면 그게 해제 문구가 되고, 없으면 폴백으로 물러난다.
import { beforeEach, describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(k: string) { return this.map.get(k) ?? null }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  removeItem(k: string) { this.map.delete(k) }
  setItem(k: string, v: string) { this.map.set(k, v) }
}
globalThis.localStorage = new MemoryStorage()

import type { UserAlarm } from '../src/lib/userAlarms'
import { loadDismissPhrase, TEST_DISMISS_PHRASE } from '../src/lib/alarmDismissPhrase'

// saveAll이 window/네이티브를 건드려 테스트 환경에서 못 도니, 알람을 저장소에 직접 넣어
// loadDismissPhrase(실제 바꾼 로직)만 검증한다.
function seedAlarm(over: Partial<UserAlarm>): UserAlarm {
  const a: UserAlarm = {
    id: 'a1', time: '07:00', label: '알람', enabled: true,
    repeatDays: [0, 1, 2, 3, 4, 5, 6], createdAt: 1, updatedAt: 2, ...over,
  }
  localStorage.setItem('futureme-user-alarms', JSON.stringify([a]))
  return a
}

beforeEach(() => localStorage.clear())

describe('밤 다짐 → 해제 문구', () => {
  it('다짐이 있으면 그게 해제 문구가 된다 (source: user)', () => {
    seedAlarm({ resolve: '오늘 나는 미루지 않는다' })
    const phrase = loadDismissPhrase('a1', '2026-08-01')
    expect(phrase?.phrase).toBe('오늘 나는 미루지 않는다')
    expect(phrase?.source).toBe('user')
  })

  it('다짐이 없으면 폴백 문구로 물러난다 (해제는 되게)', () => {
    seedAlarm({})
    const phrase = loadDismissPhrase('a1', '2026-08-01')
    expect(phrase?.phrase).toBe(TEST_DISMISS_PHRASE)
    expect(phrase?.source).toBe('fallback')
  })

  it('다짐이 공백뿐이면 폴백으로 물러난다', () => {
    seedAlarm({ resolve: '   ' })
    expect(loadDismissPhrase('a1', '2026-08-01')?.source).toBe('fallback')
  })
})
