import { describe, expect, it } from 'vitest'
import {
  isDismissPhraseComplete,
  normalizeDismissPhrase,
} from '../src/lib/alarmDismissPhrase'

describe('alarmDismissPhrase', () => {
  it('normalizes to at most 3 non-empty lines', () => {
    expect(normalizeDismissPhrase('  첫 줄  \n\n둘째\n셋째\n넷째')).toBe('첫 줄\n둘째\n셋째')
  })

  it('requires exact match including newlines', () => {
    const phrase = '나는 오늘도\n한 걸음\n내딛겠다'
    expect(isDismissPhraseComplete(phrase, '나는 오늘도\n한 걸음')).toBe(false)
    expect(isDismissPhraseComplete(phrase, phrase)).toBe(true)
  })
})
