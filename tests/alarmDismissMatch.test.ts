import { describe, expect, it } from 'vitest'
import {
  alignTypedDisplay,
  commitTypedPrefix,
  dismissMatchProgress,
  isAwaitingNextLine,
  longestMatchingPrefix,
  nextExpectedChar,
  normalizeTypedInput,
  phraseFullyMatched,
  phraseMatchStates,
} from '../src/lib/alarmDismissMatch'

describe('alarmDismissMatch', () => {
  it('keeps longest valid prefix', () => {
    const phrase = '나는 오늘도\n한 걸음'
    expect(longestMatchingPrefix(phrase, '나는 오')).toBe('나는 오')
    expect(longestMatchingPrefix(phrase, '나는 틀')).toBe('나는 ')
  })

  it('matches 3 lines without explicit newlines', () => {
    const phrase = '첫째줄이다\n둘째줄이다\n셋째줄이다'
    const typed = '첫째줄이다둘째줄이다셋째줄이다'
    expect(phraseFullyMatched(phrase, typed)).toBe(true)
    expect(dismissMatchProgress(phrase, typed)).toBe(100)
  })

  it('commits exact prefix', () => {
    const phrase = 'abc'
    expect(commitTypedPrefix(phrase, 'ab')).toBe('ab')
    expect(commitTypedPrefix(phrase, 'ax')).toBe('a')
  })

  it('aligns display newlines when typing continues without Enter', () => {
    const phrase = '첫째줄이다\n둘째줄이다'
    expect(alignTypedDisplay(phrase, '첫째줄이다')).toBe('첫째줄이다')
    expect(alignTypedDisplay(phrase, '첫째줄이다둘')).toBe('첫째줄이다\n둘')
    expect(isAwaitingNextLine(phrase, '첫째줄이다')).toBe(true)
    expect(nextExpectedChar(phrase, '첫째줄이다')).toBe('둘')
  })

  it('normalizes raw input with auto newlines and prefix commit', () => {
    const phrase = 'abc\ndef'
    expect(normalizeTypedInput(phrase, 'abc')).toBe('abc')
    expect(normalizeTypedInput(phrase, 'abcd')).toBe('abc\nd')
    expect(normalizeTypedInput(phrase, 'abcx')).toBe('abc')
  })

  it('marks wrong syllables red state', () => {
    const states = phraseMatchStates('박종윤', '밥종')
    expect(states[0]).toEqual({ kind: 'wrong', typed: '밥' })
    expect(states[1]).toEqual({ kind: 'correct', char: '종' })
    expect(states[2]).toEqual({ kind: 'pending', char: '윤' })
  })
})

// 2026-08-06 폰(TestFlight)에서 발생: 한글이 한 글자도 안 쳐져 알람을 못 껐다.
// "오"는 ㅇ→ㅗ 두 단계로 완성되는데 첫 단계 "ㅇ"을 틀렸다고 버리면
// React가 textarea 값을 되돌리고 iOS 키보드의 조합이 깨진다.
describe('한글 조합 — 낱자를 버리지 않는다 (알람이 안 꺼지던 버그)', () => {
  const phrase = '오늘도 미래의 나를 선택한다'

  it('첫 낱자 ㅇ이 살아남는다 — 버리면 조합이 깨진다', () => {
    expect(normalizeTypedInput(phrase, 'ㅇ')).toBe('ㅇ')
  })

  it('조합이 끝나 "오"가 되면 정상적으로 맞는 글자로 잡힌다', () => {
    expect(normalizeTypedInput(phrase, '오')).toBe('오')
    expect(dismissMatchProgress(phrase, '오')).toBeGreaterThan(0)
  })

  it('맞게 친 뒤 이어지는 낱자도 살아남는다', () => {
    expect(normalizeTypedInput(phrase, '오늘ㄷ')).toBe('오늘ㄷ')
  })

  it('낱자 앞의 틀린 글자는 여전히 버린다 — 판정 자체는 그대로', () => {
    expect(normalizeTypedInput(phrase, '오늘Xㄷ')).toBe('오늘ㄷ')
  })
})
