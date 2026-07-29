import { describe, expect, it } from 'bun:test'
import { buildFutureVisionPrompt, hasFutureVisionSource } from '../src/lib/futureVisionEngine'
import { emptyFutureSelf, emptyProfile } from '../src/types/self'

describe('buildFutureVisionPrompt', () => {
  it('미래 프로필 내용을 프롬프트에 담는다', () => {
    const profile = emptyProfile()
    profile.future = {
      ...emptyFutureSelf(),
      identityLine: '스타트업을 이끄는 사람',
      typicalDay: '아침 운동 후 회사',
    }
    const prompt = buildFutureVisionPrompt(profile)
    expect(prompt).toContain('5 years')
    expect(prompt).toContain('스타트업')
    expect(prompt).toContain('same person')
  })
})

describe('hasFutureVisionSource', () => {
  it('미래 필드가 있으면 true', () => {
    const profile = emptyProfile()
    profile.future.identityLine = '창업가'
    expect(hasFutureVisionSource(profile)).toBe(true)
  })

  it('비어 있으면 false', () => {
    expect(hasFutureVisionSource(emptyProfile())).toBe(false)
  })
})
