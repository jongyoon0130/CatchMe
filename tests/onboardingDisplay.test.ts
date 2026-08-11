import { describe, expect, it } from 'bun:test'
import { splitBold } from '../src/lib/chatDisplay'
import { CORE_STEP_COUNT, ONBOARDING_PAGES, ONBOARDING_STEPS, onboardingProgress } from '../src/lib/onboardingConfig'

describe('splitBold', () => {
  it('홀수 조각이 굵게 그릴 부분', () => {
    expect(splitBold('5년 뒤 **미래의 너**와 대화')).toEqual(['5년 뒤 ', '미래의 너', '와 대화'])
  })

  it('강조가 여러 개여도 홀짝이 유지된다', () => {
    const parts = splitBold('**정답**이 아니어도 돼. **언제든** 바꿔.')
    expect(parts.filter((_, i) => i % 2)).toEqual(['정답', '언제든'])
  })

  it('강조가 없으면 원문 한 조각', () => {
    expect(splitBold('그냥 문장')).toEqual(['그냥 문장'])
  })

  it('온보딩 문구에서 별표가 글자로 남지 않는다', () => {
    // 회귀: 렌더러가 마크다운을 안 그려서 별표가 화면에 그대로 보였다
    for (const step of ONBOARDING_STEPS) {
      for (const line of step.lines) {
        expect(splitBold(line).join('')).not.toContain('**')
      }
    }
  })
})

describe('onboardingProgress — 이제 페이지 기준', () => {
  it('첫 장은 1/4, 마지막 장은 4/4', () => {
    // 예전엔 1/39, 심화 3/24였다. 끝이 안 보이는 게 이탈의 이유였다.
    expect(onboardingProgress(0)).toEqual({ label: '1 / 4', percent: 25 })
    expect(onboardingProgress(3)).toEqual({ label: '4 / 4', percent: 100 })
  })

  it('범위를 벗어나도 1~4 사이로 잡아준다', () => {
    expect(onboardingProgress(-5).label).toBe('1 / 4')
    expect(onboardingProgress(99).label).toBe('4 / 4')
  })
})

// 이 PR의 핵심 약속: **문항을 줄이지 않는다. 묶기만 한다.**
// 페이지를 손보다 질문 하나를 흘리면 페르소나에 빈칸이 생기는데,
// 그건 대화가 밋밋해질 때까지 아무도 눈치채지 못한다. 여기서 잡는다.
describe('4페이지 묶음 — 핵심 문항을 하나도 빠뜨리지 않는다', () => {
  /** 안내 화면(section)과 분기 화면(finish-offer)은 질문이 아니다 */
  const coreQuestions = ONBOARDING_STEPS.slice(0, CORE_STEP_COUNT).filter(
    (s) => s.kind !== 'section' && s.kind !== 'finish-offer',
  )
  const onPages = ONBOARDING_PAGES.flatMap((p) => p.steps)

  it('4장이다', () => {
    expect(ONBOARDING_PAGES.length).toBe(4)
  })

  it('핵심 질문 13개가 그대로 4장에 담겨 있다', () => {
    expect(coreQuestions.length).toBe(13)
    expect(onPages.length).toBe(coreQuestions.length)
    for (const q of coreQuestions) expect(onPages).toContain(q)
  })

  it('같은 질문이 두 장에 겹쳐 실리지 않는다', () => {
    expect(new Set(onPages).size).toBe(onPages.length)
  })

  it('심화 코스는 온보딩에 실리지 않는다', () => {
    const deep = ONBOARDING_STEPS.slice(CORE_STEP_COUNT)
    expect(deep.length).toBeGreaterThan(0) // 정의는 남아 있어야 한다 (페르소나 채우기가 쓴다)
    for (const s of deep) expect(onPages).not.toContain(s)
  })

  it('한 장에 서술형은 최대 2개다', () => {
    // 원칙: 짧은 것 먼저, 페이지당 서술형 최대 2개. 넘으면 그 장에서 유저가 지친다.
    const tooMany = ONBOARDING_PAGES.filter(
      (p) => p.steps.filter((s) => s.kind === 'profile-text' || s.kind === 'future-text').length > 2,
    ).map((p) => p.title)
    expect(tooMany).toEqual([])
  })

  it('첫 장은 짧은 질문부터 — 이름이 맨 앞이다', () => {
    expect(ONBOARDING_PAGES[0].steps[0].kind).toBe('name')
  })
})
