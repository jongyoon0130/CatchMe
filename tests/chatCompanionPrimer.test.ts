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
import { buildSystemPrompt, analyzeMessage } from '../src/lib/selfEngine'
import { VOICE_EXAMPLES } from '../src/lib/voiceExamples'
import { emptyProfile } from '../src/types/self'

/** 되묻기 = 물음표로 끝남 */
function asksBack(reply: string): boolean {
  return reply.trim().endsWith('?')
}

const DAILY_LIFE_CASES = ['카페 왔어', '오늘 할 일 다 끝냈어', '또 미뤘어']

describe('VOICE_EXAMPLES — 일상·성취·미룸은 되묻지 않는다', () => {
  it('A·B·C 예시가 모두 들어 있다', () => {
    for (const hint of DAILY_LIFE_CASES) {
      const found = VOICE_EXAMPLES.some((ex) => ex.user.includes(hint))
      expect(found).toBe(true)
    }
  })

  it('그 예시들의 답이 되묻기로 끝나지 않는다', () => {
    for (const hint of DAILY_LIFE_CASES) {
      const ex = VOICE_EXAMPLES.find((e) => e.user.includes(hint))!
      expect(asksBack(ex.model)).toBe(false)
    }
  })

  it('겪어본 사람의 한 줄이 있다 (그냥 카톡 친구가 되지 않게)', () => {
    // 지웅님 실측(2026-08-06): 자기서사('나도 그때')보다 **'~더라'**를 훨씬 많이 쓴다 (2 vs 9)
    const experienceMarks = /(그때|나도|더라|쌓여|기억도 안)/
    for (const hint of ['카페 왔어', '오늘 할 일 다 끝냈어']) {
      const ex = VOICE_EXAMPLES.find((e) => e.user.includes(hint))!
      expect(ex.model).toMatch(experienceMarks)
    }
  })
})

describe('VOICE_EXAMPLES — lite 모드 보호', () => {
  it('lite 프롬프트에도 예시가 실리고, 일상과 고민이 둘 다 들어간다', () => {
    const msg = '비 엄청 온다'
    const lite = buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(msg), undefined, msg, true)
    expect(lite).toContain('우산은 챙겼어?')       // 일상
    expect(lite).toContain('아무것도 못했어')       // 자책
    expect((lite.match(/예\d+\) 속마음/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('첫 예시는 일상 공유(되묻지 않기)다', () => {
    expect(asksBack(VOICE_EXAMPLES[0]!.model)).toBe(false)
  })

  it('고민 예시도 남아 있다 — 되묻기가 맞는 자리까지 없애지는 않는다', () => {
    const someoneAsksBack = VOICE_EXAMPLES.some((ex) => asksBack(ex.model))
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

  it('겪어본 사람의 한 줄이 지시된다 (카톡 친구화 방지)', () => {
    // '반드시 매 턴'은 뺐다 — 그 강제가 18개 중 15개를 "나도 그때~"로 만들었다(2026-08-06 실측)
    expect(prompt()).toContain('겪어본 사람만 할 수 있는 **한 줄**을 얹는다')
  })

  it('성취 예시가 감정을 단정하지 않고 내 경험으로 말한다', () => {
    const ex = VOICE_EXAMPLES.find((e) => e.user.includes('다 끝냈어'))!
    expect(ex.model).toMatch(/(나도|더라)/) // 단정 대신 내 경험 — '~더라'가 지웅님 방식
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

  it('자책·힘듦 예시가 모두 들어 있다', () => {
    for (const hint of HARD_CASES) {
      expect(VOICE_EXAMPLES.find((e) => e.user.includes(hint))).toBeDefined()
    }
  })

  // 지웅님 실측(2026-08-06): 직접 쓴 30개 중 12개가 질문이었고, "왜 우울한 거 같아?"도
  // 본인이 쓴 답이다. 막아야 할 건 질문 자체가 아니라 **할 일·계획을 캐는 질문**이다.
  it('자책·힘듦에서 할 일을 캐묻지 않는다 (질문 자체는 괜찮다)', () => {
    const digsForTasks = /(어떤 (작업|일|것)부터|언제까지|몇 개|계획이 뭐|뭐부터 할)/
    for (const hint of HARD_CASES) {
      const ex = VOICE_EXAMPLES.find((e) => e.user.includes(hint))!
      expect(ex.model).not.toMatch(digsForTasks)
    }
  })

  it('면접식 되묻기("특히 찌르는 순간")가 예시에서 사라졌다', () => {
    expect(VOICE_EXAMPLES.some((e) => e.model.includes('찌르는 순간'))).toBe(false)
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

  it('자책엔 원인을 캐묻지 말라는 규칙이 실린다', () => {
    expect(promptFor('또 미뤘어...')).toContain('자책엔 캐묻지 말 것')
  })
})

// 지웅님이 직접 쓴 답 30개(2026-08-06)에서 나온 기준.
// 평균 1.9문장·36자, '나도' 2개 vs '~더라' 9개, 30개 중 12개가 질문.
describe('지웅님 목소리에 맞추기 (실측 30개 기준)', () => {
  const prompt = () => {
    const msg = '오늘 헬스장 다녀왔어'
    return buildSystemPrompt({ ...emptyProfile(), name: '지웅' }, analyzeMessage(msg), undefined, msg)
  }

  it('길이 기본값이 1~2문장이다', () => {
    expect(prompt()).toContain('보통 1~2문장')
  })

  it('경험은 자기서사가 아니라 "~하더라"로 얹으라고 지시한다', () => {
    expect(prompt()).toContain('~하더라')
    expect(prompt()).toContain('매 턴 넣지 말 것')
  })

  it('걱정해서 묻는 질문은 허용, 할 일 캐묻기만 금지', () => {
    expect(prompt()).toContain('걱정해서 묻는 건 친구답다')
    expect(prompt()).toContain('할 일·계획을 캐는 질문')
  })

  it('응원은 과제 밀기가 아니라고 명시한다', () => {
    expect(prompt()).toContain('응원은 과제가 아니다')
  })

  it('짧은 한 줄도 답이 된다고 알려준다', () => {
    expect(prompt()).toContain('훌륭한 답이다')
  })
})

// 채점기 자체를 검증한다 — 지웅님이 직접 쓴 답을 떨어뜨리면 기준이 틀린 것이다.
// 실제로 두 번 틀렸다: (1) 감정 자리 되묻기 금지 (2) 문장 수 제한.
// 둘 다 지웅님 답이 불합격해서 발견했다.
describe('채점 기준이 정답지를 통과시키는가', () => {
  it('지웅님이 직접 쓴 30개 답이 전부 통과한다', async () => {
    const { ALL_CASES, CHECKS } = await import('../eval/chatCases')
    const { GOLD_ANSWERS } = await import('../eval/goldAnswers')
    const failed: string[] = []
    for (const c of ALL_CASES) {
      const text = GOLD_ANSWERS[c.id]
      if (!text) continue
      for (const id of c.expect) {
        if (!CHECKS[id].test(text)) failed.push(`${c.id}: ${CHECKS[id].label}`)
      }
    }
    expect(failed).toEqual([])
  })
})
