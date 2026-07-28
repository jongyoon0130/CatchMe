import { describe, expect, it } from 'vitest'
import {
  commitTypedPrefix,
  dismissMatchProgress,
  longestMatchingPrefix,
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

  it('marks wrong syllables red state', () => {
    const states = phraseMatchStates('박종윤', '밥종')
    expect(states[0]).toEqual({ kind: 'wrong', typed: '밥' })
    expect(states[1]).toEqual({ kind: 'correct', char: '종' })
    expect(states[2]).toEqual({ kind: 'pending', char: '윤' })
  })
})
