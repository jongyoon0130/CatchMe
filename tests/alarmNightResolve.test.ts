// 밤 다짐(UserAlarm.resolve) → 아침 해제 문구 연결.
//
// 지키려는 것은 처음과 같다: **밤에 적어둔 다짐이 아침 해제 문구에 반영된다.**
// 다만 구조가 바뀌었다 —
//   예전: loadDismissPhrase가 알람의 resolve를 직접 읽어 문구로 씀
//   지금: resolve가 문구 생성 문맥(AlarmDismissContext)으로 넘어가고,
//         AI 생성이 없거나 실패하면 buildFallbackDismissPhrase가 그걸 첫 줄로 쓴다
// 그래서 검증 지점을 폴백 생성기로 옮긴다. (AI 경로는 네트워크라 여기서 다루지 않음)
import { describe, expect, it } from 'bun:test'

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

import type { AlarmDismissContext } from '../src/lib/alarmDismissContext'
import { buildFallbackDismissPhrase } from '../src/lib/alarmDismissPhraseEngine'

function ctx(over: Partial<AlarmDismissContext> = {}): AlarmDismissContext {
  return {
    alarmLabel: '알람',
    futureIdentity: '',
    futureAdvice: '',
    futureTypicalDay: '',
    futureAchievement: '',
    futureThroughline: '',
    currentRole: '',
    goals: [],
    hasPersonalData: false,
    ...over,
  }
}

describe('밤 다짐 → 아침 해제 문구', () => {
  it('밤에 적은 다짐이 해제 문구에 들어간다', () => {
    const phrase = buildFallbackDismissPhrase(ctx({ alarmResolve: '오늘 나는 미루지 않는다' }))
    expect(phrase).toContain('오늘 나는 미루지 않는다')
  })

  it('다짐이 맨 앞에 온다 — 아침에 제일 먼저 마주치는 말이어야 한다', () => {
    const phrase = buildFallbackDismissPhrase(
      ctx({ alarmResolve: '오늘 나는 미루지 않는다', futureIdentity: '창업가' }),
    )
    expect(phrase.split('\n')[0]).toContain('오늘 나는 미루지 않는다')
  })

  it('다짐이 없어도 해제 문구는 만들어진다 (알람이 안 꺼지면 안 되니까)', () => {
    const phrase = buildFallbackDismissPhrase(ctx({ futureIdentity: '창업가' }))
    expect(phrase.trim().length).toBeGreaterThan(0)
  })

  it('아무 재료가 없어도 빈 문구를 내지 않는다', () => {
    expect(buildFallbackDismissPhrase(ctx()).trim().length).toBeGreaterThan(0)
  })
})
