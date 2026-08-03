// 채팅 1·1.5단계 회귀 방지 — docs/chat-cases.md의 실패 조건을 코드로 잠근다.
//
// 지키는 것 3개:
//  1. 일상·성취·미룸(A·B·C) 예시는 **되묻지 않는다** — 여기서 되물으면 코치가 된다.
//  2. lite(긴 대화)에서 쓰는 **앞 2개**에 동행 예시가 반드시 포함된다
//     — 예전엔 앞 2개가 전부 되묻기라 대화가 길어질수록 코치처럼 변했다.
//  3. **user의 기분을 단정하지 않는다** — 실사용에서 "기분은 좀 개운하네"가 나왔다.
//     미래의 나는 지금 user 옆에 없어 그 기분을 볼 수 없다. 내 경험으로 말해야 한다.
class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}
globalThis.localStorage = new MemStorage()

import { describe, expect, it } from 'bun:test'
import { BEHAVIOR_PRIMER, buildSystemPrompt, analyzeMessage } from '../src/lib/selfEngine'
import { emptyProfile } from '../src/types/self'

/** 되묻기 = 물음표로 끝남 */
function asksBack(reply: string): boolean {
  return reply.trim().endsWith('?')
}

const DAILY_LIFE_CASES = ['카페 왔어', '오늘 할 일 다 끝냈어', '또 미뤘어']

describe('BEHAVIOR_PRIMER — 일상·성취·미룸은 되묻지 않는다', () => {
  it('A·B·C 예시가 모두 들어 있다', () => {
    for (const hint of DAILY_LIFE_CASES) {
      const found = BEHAVIOR_PRIMER.some((ex) => ex.user.includes(hint))
      expect(found).toBe(true)
    }
  })

  it('그 예시들의 답이 되묻기로 끝나지 않는다', () => {
    for (const hint of DAILY_LIFE_CASES) {
      const ex = BEHAVIOR_PRIMER.find((e) => e.user.includes(hint))!
      expect(asksBack(ex.model)).toBe(false)
    }
  })

  it('겪어본 사람의 한 줄이 있다 (그냥 카톡 친구가 되지 않게)', () => {
    // '나도/내가 그때~', '~하게 되더라', '쌓여서' 류의 경험·시간 관점
    const experienceMarks = /(그때|나도|되더라|쌓여|기억도 안)/
    for (const hint of DAILY_LIFE_CASES) {
      const ex = BEHAVIOR_PRIMER.find((e) => e.user.includes(hint))!
      expect(ex.model).toMatch(experienceMarks)
    }
  })
})

describe('BEHAVIOR_PRIMER — lite 모드(앞 2개) 보호', () => {
  it('앞 2개가 전부 되묻기면 안 된다', () => {
    const liteTwo = BEHAVIOR_PRIMER.slice(0, 2)
    expect(liteTwo.every((ex) => asksBack(ex.model))).toBe(false)
  })

  it('첫 예시는 일상 공유(되묻지 않기)다', () => {
    expect(asksBack(BEHAVIOR_PRIMER[0]!.model)).toBe(false)
  })

  it('고민 예시도 남아 있다 — 되묻기가 맞는 자리까지 없애지는 않는다', () => {
    const someoneAsksBack = BEHAVIOR_PRIMER.some((ex) => asksBack(ex.model))
    expect(someoneAsksBack).toBe(true)
  })
})

describe('감정 단정 금지 (1.5단계)', () => {
  const prompt = () => {
    const msg = '오늘 할 일 다 끝냈어!'
    return buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(msg), undefined, msg)
  }

  it('user 기분 단정 금지 규칙이 프롬프트에 있다', () => {
    expect(prompt()).toContain('기분·상태를 단정')
  })

  it('실제로 나왔던 나쁜 예("기분은 좀 개운하네")가 금지 예시로 실린다', () => {
    expect(prompt()).toContain('기분은 좀 개운하네')
  })

  it('겪어본 사람의 한 줄이 필수로 지시된다 (카톡 친구화 방지)', () => {
    expect(prompt()).toContain('반드시 하나 넣는다')
  })

  it('성취 예시가 감정을 단정하지 않고 내 경험으로 말한다', () => {
    const ex = BEHAVIOR_PRIMER.find((e) => e.user.includes('다 끝냈어'))!
    expect(ex.model).toContain('나도')
    expect(ex.model).not.toMatch(/기분(은|이)? ?좀? ?개운하네/)
  })
})
