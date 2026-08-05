import { describe, expect, it } from 'vitest'
import {
  isDismissPhraseComplete,
  normalizeDismissPhrase,
} from '../src/lib/alarmDismissPhrase'
import { buildFallbackDismissPhrase } from '../src/lib/alarmDismissPhraseEngine'
import type { AlarmDismissContext } from '../src/lib/alarmDismissContext'

describe('alarmDismissPhrase', () => {
  it('normalizes to at most 4 non-empty lines', () => {
    expect(normalizeDismissPhrase('  첫 줄  \n\n둘째\n셋째\n넷째\n다섯째')).toBe(
      '첫 줄\n둘째\n셋째\n넷째',
    )
  })

  it('requires exact match including newlines', () => {
    const phrase = '나는 오늘도\n한 걸음\n내딛겠다'
    expect(isDismissPhraseComplete(phrase, '나는 오늘도\n한 걸음')).toBe(false)
    expect(isDismissPhraseComplete(phrase, phrase)).toBe(true)
  })

  it('builds fallback from goals and future identity', () => {
    const ctx: AlarmDismissContext = {
      alarmLabel: '아침',
      futureIdentity: '창업가',
      futureAdvice: '',
      futureTypicalDay: '',
      futureAchievement: '',
      futureThroughline: '',
      currentRole: '',
      goals: [
        {
          title: 'Future Me 앱',
          whyTruth: '매일 쓰는 도구를 만들고 싶어서',
        },
      ],
      hasPersonalData: true,
    }
    const phrase = buildFallbackDismissPhrase(ctx)
    expect(phrase.split('\n').length).toBeGreaterThanOrEqual(3)
    expect(phrase).toContain('Future Me 앱')
  })
})
