import { describe, expect, it } from 'bun:test'
import {
  alarmDedupKey,
  collectScheduledAlarms,
  dateKeyFrom,
  filterDueAlarms,
  findNextAlarm,
  formatAlarmBody,
  formatAlarmTitle,
  isAlarmDue,
  type ScheduledAlarm,
} from '../src/lib/alarmEngine'

const sampleItem = {
  id: 'todo-1',
  label: '러닝 30분',
  done: false,
  planId: 'plan-1',
  planTitle: '건강',
  tier: 'daily' as const,
  timeStart: '19:00',
  timeEnd: '20:00',
}

describe('alarmEngine', () => {
  it('오늘 할 일에서 시작·끝 알람 후보를 만든다', () => {
    const alarms = collectScheduledAlarms([sampleItem], '2026-07-27')
    expect(alarms).toHaveLength(2)
    expect(alarms[0]?.kind).toBe('start')
    expect(alarms[1]?.kind).toBe('end')
  })

  it('지정 시각 ±2분 안이면 울릴 대상이다', () => {
    const alarm: ScheduledAlarm = {
      itemId: 'todo-1',
      label: '러닝',
      planTitle: '건강',
      kind: 'start',
      time: '19:00',
      dateKey: '2026-07-27',
      done: false,
    }
    expect(isAlarmDue(alarm, new Date('2026-07-27T19:00:30'))).toBe(true)
    expect(isAlarmDue(alarm, new Date('2026-07-27T19:01:59'))).toBe(true)
    expect(isAlarmDue(alarm, new Date('2026-07-27T19:02:01'))).toBe(false)
    expect(isAlarmDue(alarm, new Date('2026-07-27T18:59:30'))).toBe(false)
  })

  it('완료된 할 일은 알람에서 제외한다', () => {
    const alarm: ScheduledAlarm = {
      itemId: 'todo-1',
      label: '러닝',
      planTitle: '건강',
      kind: 'start',
      time: '19:00',
      dateKey: '2026-07-27',
      done: true,
    }
    expect(isAlarmDue(alarm, new Date('2026-07-27T19:00:10'))).toBe(false)
  })

  it('중복 키와 설정에 따라 필터링한다', () => {
    const alarms = collectScheduledAlarms([sampleItem], '2026-07-27')
    const now = new Date('2026-07-27T19:00:05')
    const fired = new Set([alarmDedupKey(alarms[0]!)])
    const due = filterDueAlarms(alarms, now, fired, { startAlarms: true, endAlarms: true })
    expect(due).toHaveLength(0)

    const dueEnd = filterDueAlarms(
      [{ ...alarms[1]!, time: '19:00' }],
      now,
      new Set(),
      { startAlarms: false, endAlarms: true },
    )
    expect(dueEnd).toHaveLength(1)
  })

  it('다음 알람을 찾는다', () => {
    const alarms = collectScheduledAlarms([sampleItem], '2026-07-27')
    const next = findNextAlarm(alarms, new Date('2026-07-27T18:00:00'), new Set())
    expect(next?.kind).toBe('start')
    expect(next?.time).toBe('19:00')
  })

  it('알람 문구를 만든다', () => {
    const alarm: ScheduledAlarm = {
      itemId: 'todo-1',
      label: '러닝 30분',
      planTitle: '건강',
      kind: 'start',
      time: '19:00',
      dateKey: dateKeyFrom(new Date('2026-07-27')),
      done: false,
    }
    expect(formatAlarmTitle(alarm)).toBe('이제 시작할 시간이야')
    expect(formatAlarmBody(alarm)).toContain('건강')
    expect(formatAlarmBody(alarm)).toContain('러닝 30분')
  })
})
