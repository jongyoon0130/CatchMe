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

// 2단계 — 실행 리듬 배선. 예전엔 구 플래너(p.planner)에서 읽어서 늘 빈칸이었다.
// 여기서 깨지면 "어제 미룬 그거"를 말할 근거가 프롬프트에서 사라진 것이다.
describe('실행 리듬 배선 (2단계) — 지난날이 프롬프트에 실린다', () => {
  const dayKeyOf = (offsetDays: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it('어제 안 한 할 일이 시스템 프롬프트에 남는다', () => {
    localStorage.clear()
    localStorage.setItem('goal-app-owner-id', 'owner-1')
    localStorage.setItem(
      'goal-misc-todos-owner-1',
      JSON.stringify([
        { id: 'y1', label: '이력서 고치기', done: false, tier: 'daily', periodKey: dayKeyOf(-1) },
      ]),
    )

    const msg = '또 미뤘어'
    const out = buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(msg), undefined, msg)
    expect(out).toContain('이력서 고치기')
    expect(out).toContain('어제')
    localStorage.clear()
  })
})

// C·D (docs/chat-cases.md) — 자책엔 반례, 힘듦엔 되묻지 않기.
// D의 "무엇이 위로냐"는 사람마다 달라서 고정 답을 두지 않는다. 온보딩에서 user가
// 직접 고른 future.adviceTone이 색을 정한다 — 예전엔 저장만 되고 안 쓰였다.
describe('C·D — 자책 반례와 위로 방향', () => {
  const HARD_CASES = ['오늘 아무것도 못했어', '하... 힘들다', '요즘 좀 우울해']

  it('자책·힘듦 예시가 모두 들어 있고, 되묻기로 끝나지 않는다', () => {
    for (const hint of HARD_CASES) {
      const ex = BEHAVIOR_PRIMER.find((e) => e.user.includes(hint))
      expect(ex).toBeDefined()
      expect(asksBack(ex!.model)).toBe(false)
    }
  })

  it('면접식 되묻기("특히 찌르는 순간")가 예시에서 사라졌다', () => {
    expect(BEHAVIOR_PRIMER.some((e) => e.model.includes('찌르는 순간'))).toBe(false)
  })

  const promptFor = (tone: 'comfort' | 'tough', msg = '하... 힘들다') => {
    const base = emptyProfile()
    const p = { ...base, name: '지웅', comfortTarget: '네 페이스대로 가도 돼', future: { ...base.future, adviceTone: tone } }
    return buildSystemPrompt(p, analyzeMessage(msg), undefined, msg)
  }

  it('위로가 필요한 턴에 user가 고른 위로 방향이 실린다', () => {
    expect(promptFor('comfort')).toContain('위로가 필요한 자리')
    expect(promptFor('comfort')).toContain('네 페이스대로 가도 돼')
  })

  it('고른 톤에 따라 지시가 갈린다 — 따끔은 무르게 넘어가주지 않는다', () => {
    expect(promptFor('tough')).toContain('무르게 넘어가주지 않기')
    expect(promptFor('comfort')).not.toContain('무르게 넘어가주지 않기')
    expect(promptFor('comfort')).toContain('받아주고 멈춰주기')
  })

  it('위로 턴이 아니면 싣지 않는다 — 매 턴 끌고 다니지 않는다', () => {
    expect(promptFor('comfort', '오늘 할 일 다 끝냈어!')).not.toContain('위로가 필요한 자리')
  })

  it('구체화(좁히기) 지시가 힘듦 턴에서 꺼진다 — 되묻기의 진짜 출처였다', () => {
    expect(promptFor('comfort')).not.toContain('구체화 단계')
    expect(promptFor('comfort')).not.toContain('찔렀는지')
    // 되묻기가 맞는 자리(E 고민)는 그대로 남는다
    const e = '요즘 뭔가 고민인데'
    expect(buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(e), undefined, e)).toContain('구체화 단계')
  })

  it('면죄부는 가벼운 날만이라는 규칙이 계획표 블록과 함께 실린다 (C-2)', () => {
    // 이 규칙은 "며칠째 밀림"을 보고 판단하는 것이라, 계획표 데이터가 있을 때만 의미가 있다
    localStorage.clear()
    localStorage.setItem('goal-app-owner-id', 'owner-1')
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    localStorage.setItem(
      'goal-misc-todos-owner-1',
      JSON.stringify([{ id: 'm1', label: '운동', done: false, tier: 'daily', periodKey: key }]),
    )
    const out = promptFor('comfort')
    expect(out).toContain('자책엔 반례로')
    expect(out).toContain('면죄부는 가벼운 날만')
    localStorage.clear()
  })
})

// 채점표 2회차(2026-08-06, 16/18)에서 남은 2개 — 실측으로 원인이 확정된 것들.
describe('자책 되묻기 · 문어체 (채점표에서 잡힌 것)', () => {
  const promptFor = (msg: string) => {
    localStorage.clear()
    localStorage.setItem('goal-app-owner-id', 'o1')
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    localStorage.setItem(
      'goal-misc-todos-o1',
      JSON.stringify([{ id: 'm1', label: '운동', done: false, tier: 'daily', periodKey: key }]),
    )
    return buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(msg), undefined, msg)
  }

  it('자책은 comfort로 분류되지 않는다 — 그래서 위로 섹션에 기댈 수 없다', () => {
    // "또 미뤘어"는 needs:[listen]이라 위로 섹션이 안 붙는다. 계획표 규칙 쪽에서 막아야 한다.
    expect(analyzeMessage('또 미뤘어...').needs).not.toContain('comfort')
  })

  it('자책엔 되묻지 말라는 규칙이 실린다', () => {
    expect(promptFor('또 미뤘어...')).toContain('자책엔 되묻지 말 것')
  })

  it('문어체 금지 규칙이 실린다 — "실내"가 아니라 "밖"', () => {
    expect(promptFor('비 엄청 온다')).toContain('문어체·한자어')
  })
})
