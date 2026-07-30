import { describe, expect, it } from 'vitest'
import { isBatteryDischarge } from '../src/components/goal/GoalBatteryIcon'

describe('isBatteryDischarge', () => {
  it('할 일 없으면 방전 표시 안 함', () => {
    expect(isBatteryDischarge(false, 0)).toBe(false)
  })

  it('할 일 있고 0%면 방전 표시', () => {
    expect(isBatteryDischarge(true, 0)).toBe(true)
  })

  it('일부 완료면 방전 표시 안 함', () => {
    expect(isBatteryDischarge(true, 40)).toBe(false)
  })
})
