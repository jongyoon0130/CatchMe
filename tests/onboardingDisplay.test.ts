import { describe, expect, it } from 'bun:test'
import { splitBold } from '../src/lib/chatDisplay'
import { CORE_STEP_COUNT, ONBOARDING_STEPS, onboardingProgress } from '../src/lib/onboardingConfig'

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

describe('onboardingProgress', () => {
  it('핵심 코스는 finish-offer까지', () => {
    expect(ONBOARDING_STEPS[CORE_STEP_COUNT - 1].kind).toBe('finish-offer')
  })

  it('핵심 구간에선 전체가 아니라 핵심 개수로 센다', () => {
    // 봇이 "핵심 질문 15개면 시작할 수 있어"라고 말하는데 1/39로 보이면 유저가 나간다
    expect(onboardingProgress(0)).toEqual({
      label: `1 / ${CORE_STEP_COUNT}`,
      percent: Math.round((1 / CORE_STEP_COUNT) * 100),
    })
    expect(onboardingProgress(CORE_STEP_COUNT - 1)).toEqual({
      label: `${CORE_STEP_COUNT} / ${CORE_STEP_COUNT}`,
      percent: 100,
    })
  })

  it('핵심을 넘기면 심화로 다시 센다', () => {
    const deepTotal = ONBOARDING_STEPS.length - CORE_STEP_COUNT
    expect(onboardingProgress(CORE_STEP_COUNT)).toEqual({ label: `심화 1 / ${deepTotal}`, percent: Math.round((1 / deepTotal) * 100) })
    expect(onboardingProgress(ONBOARDING_STEPS.length - 1).percent).toBe(100)
  })
})
