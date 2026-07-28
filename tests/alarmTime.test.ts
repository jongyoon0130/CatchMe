import { describe, expect, it } from 'vitest'
import { parseAlarmTime24, toAlarmTime24 } from '../src/lib/alarmTime'

describe('alarmTime', () => {
  it('parseAlarmTime24 keeps exact minutes', () => {
    expect(parseAlarmTime24('07:37')).toEqual({ period: 'am', hour12: 7, minute: 37 })
    expect(parseAlarmTime24('14:03')).toEqual({ period: 'pm', hour12: 2, minute: 3 })
  })

  it('toAlarmTime24 round-trips', () => {
    expect(toAlarmTime24('am', 7, 37)).toBe('07:37')
    expect(toAlarmTime24('pm', 2, 3)).toBe('14:03')
  })
})
