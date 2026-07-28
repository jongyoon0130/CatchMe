import { describe, expect, it } from 'vitest'
import {
  commitTypedPrefix,
  longestMatchingPrefix,
  phraseMatchStates,
} from '../src/lib/alarmDismissMatch'

describe('alarmDismissMatch', () => {
  it('keeps longest valid prefix', () => {
    const phrase = '나는 오늘도\n한 걸음'
    expect(longestMatchingPrefix(phrase, '나는 오')).toBe('나는 오')
    expect(longestMatchingPrefix(phrase, '나는 틀')).toBe('나는 ')
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
