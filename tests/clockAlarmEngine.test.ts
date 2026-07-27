import { describe, expect, it } from 'bun:test'
import {
  clockAlarmDedupKey,
  collectClockAlarms,
  dateKeyFrom,
  filterDueClockAlarms,
  findNextClockAlarm,
  isClockAlarmDue,
  userAlarmActiveOnDate,
} from '../src/lib/clockAlarmEngine'
import type { UserAlarm } from '../src/lib/userAlarms'

function alarm(partial: Partial<UserAlarm> & Pick<UserAlarm, 'time'>): UserAlarm {
  return {
    id: partial.id ?? 'a1',
    time: partial.time,
    label: partial.label ?? '기상',
    enabled: partial.enabled ?? true,
    repeatDays: partial.repeatDays ?? [0, 1, 2, 3, 4, 5, 6],
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('clockAlarmEngine', () => {
  it('활성화된 알람만 오늘 후보에 넣는다', () => {
    const list = [
      alarm({ id: 'on', time: '07:00' }),
      alarm({ id: 'off', time: '08:00', enabled: false }),
    ]
    const triggers = collectClockAlarms(list, new Date('2026-07-27T10:00:00'))
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.alarmId).toBe('on')
  })

  it('반복 요일에 맞을 때만 울린다', () => {
    const monday = new Date('2026-07-27T12:00:00') // Monday
    expect(userAlarmActiveOnDate(alarm({ time: '07:00', repeatDays: [1] }), monday)).toBe(true)
    expect(userAlarmActiveOnDate(alarm({ time: '07:00', repeatDays: [0] }), monday)).toBe(false)
  })

  it('지정 시각 ±2분 안이면 due', () => {
    const trigger = collectClockAlarms([alarm({ time: '19:00' })], new Date('2026-07-27T12:00:00'))[0]!
    expect(isClockAlarmDue(trigger, new Date('2026-07-27T19:00:30'))).toBe(true)
    expect(isClockAlarmDue(trigger, new Date('2026-07-27T19:02:30'))).toBe(false)
  })

  it('중복 발송을 dedup 키로 막는다', () => {
    const triggers = collectClockAlarms([alarm({ time: '19:00' })], new Date('2026-07-27T12:00:00'))
    const fired = new Set([clockAlarmDedupKey(triggers[0]!)])
    const due = filterDueClockAlarms(triggers, new Date('2026-07-27T19:00:10'), fired)
    expect(due).toHaveLength(0)
  })

  it('다음 알람을 찾는다', () => {
    const list = [alarm({ id: '1', time: '19:00' }), alarm({ id: '2', time: '21:00' })]
    const next = findNextClockAlarm(list, new Date('2026-07-27T18:00:00'), new Set())
    expect(next?.time).toBe('19:00')
    expect(dateKeyFrom(new Date('2026-07-27T18:00:00'))).toBe('2026-07-27')
  })
})
