import { describe, expect, it } from 'bun:test'
import {
  buildFutureHeaderChips,
  buildFutureSummaryLine,
  buildProfileHeaderChips,
  toAdviceQuote,
} from '../src/lib/profilePhrases'

describe('buildProfileHeaderChips', () => {
  it('나이·학년·창업 준비를 키워드 칩으로 뽑는다', () => {
    const chips = buildProfileHeaderChips({
      age: 24,
      currentRole: '대학교3학년이고, 현재는 창업을 하고싶어서 그 준비중',
    })
    expect(chips).toContain('24세')
    expect(chips).toContain('대학교 3학년')
    expect(chips).toContain('창업 준비')
    expect(chips.every((c) => c.length <= 14)).toBe(true)
  })

  it('직장인·년차를 뽑는다', () => {
    const chips = buildProfileHeaderChips({
      age: 28,
      currentRole: 'IT 회사 백엔드 3년차',
    })
    expect(chips).toContain('28세')
    expect(chips).toContain('3년차')
    expect(chips).toContain('백엔드')
  })

  it('데이터가 없으면 기본 칩을 준다', () => {
    expect(buildProfileHeaderChips({})).toEqual(['지금의 나'])
  })
})

describe('buildFutureHeaderChips', () => {
  it('졸업·스타트업·사업가 칩을 뽑는다', () => {
    const chips = buildFutureHeaderChips({
      identityLine:
        '5년 뒤에 나는 대학교를 졸업하고 스타트업을 차렸어. 마음 맞는 사람들과 함께 스타트업을 진행 중이고, 결국은 사업가인거지.',
      typicalDay: '아침에 일어나서 건강하게 먹고, 바로 회사로 갈거야. 워라밸은 없고',
    })
    expect(chips).toContain('졸업')
    expect(chips.some((c) => c === '스타트업' || c === '창업' || c === '사업가')).toBe(true)
  })
})

describe('toAdviceQuote', () => {
  it('긴 편지를 한 마디로 줄인다', () => {
    const q = toAdviceQuote(
      '쓸데없는 걱정 할 시간에 더 머리박고 해. 지금 그런거 걱정할 때가 아니야.',
    )
    expect(q.length).toBeLessThanOrEqual(48)
    expect(q.length).toBeGreaterThan(3)
  })
})

describe('buildFutureSummaryLine', () => {
  it('identityLine을 짧은 한 줄로 만든다', () => {
    const line = buildFutureSummaryLine({
      identityLine:
        '5년 뒤에 나는 대학교를 졸업하고 스타트업을 차렸어. 마음 맞는 사람들과 함께 스타트업을 진행 중이고, 결국은 사업가인거지.',
    })
    expect(line.length).toBeLessThanOrEqual(40)
    expect(line).not.toContain('마음 맞는')
  })
})
