import { describe, expect, it } from 'vitest'
import { commitTypedPrefix, longestMatchingPrefix } from '../src/lib/alarmDismissMatch'

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
})
