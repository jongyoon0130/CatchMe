import { describe, expect, it } from 'bun:test'
import { FutureMeAlarmWeb } from '../src/lib/nativeAlarm/futureMeAlarmWeb'

describe('FutureMeAlarmWeb mock', () => {
  it('syncAlarms stores count', async () => {
    const web = new FutureMeAlarmWeb()
    const result = await web.syncAlarms({
      alarms: [
        {
          id: 'a1',
          time: '07:00',
          label: '테스트',
          enabled: true,
          repeatDays: [1, 2, 3, 4, 5],
          phrase: '안녕',
        },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.count).toBe(1)
    const status = await web.getStatus()
    expect(status.scheduledCount).toBe(1)
    expect(status.mode).toBe('mock')
  })

  it('simulateAlarm returns ok', async () => {
    const web = new FutureMeAlarmWeb()
    const result = await web.simulateAlarm({
      alarmId: 'a1',
      label: '테스트',
      time: '07:00',
      phrase: '안녕',
    })
    expect(result.ok).toBe(true)
  })
})
