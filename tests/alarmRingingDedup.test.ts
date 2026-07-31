// 알람 울림 중복/부활 방지. 두 경로(포그라운드 스케줄러 + 서비스워커)가 같은 알람에
// 각각 startRingingAlarm을 부를 때, 두 번 뜨거나 해제 뒤 되살아나지 않아야 한다.
import { beforeEach, describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}
globalThis.localStorage = new MemoryStorage()
// startRingingAlarm이 window로 이벤트를 쏘므로 최소 스텁
globalThis.window = { dispatchEvent: () => true } as unknown as Window & typeof globalThis
globalThis.CustomEvent = class { constructor(_t?: string, _o?: unknown) {} } as unknown as typeof CustomEvent

import type { ClockAlarmTrigger } from '../src/lib/clockAlarmEngine'
import { startRingingAlarm, stopRingingAlarm, getRingingAlarm } from '../src/lib/alarmRingingStore'

const A: ClockAlarmTrigger = { alarmId: 'a1', dateKey: '2026-08-01', time: '07:00', label: '알람' }
const A_SW: ClockAlarmTrigger = { ...A, label: '알람(sw)' } // 같은 dedup(id+date+time)
const B: ClockAlarmTrigger = { alarmId: 'b2', dateKey: '2026-08-01', time: '08:00', label: '다른 알람' }

beforeEach(() => {
  localStorage.clear()
  stopRingingAlarm() // 잔여 상태 초기화 (lastHandledDedup는 다른 알람이라 아래 케이스에 영향 없음)
})

describe('startRingingAlarm 중복/부활 방지', () => {
  it('같은 알람이 두 경로로 울려도 먼저 뜬 게 유지된다 (안녕이 덮지 않음)', () => {
    startRingingAlarm(A, '오늘 나는 미루지 않는다') // 포그라운드(제 다짐)
    startRingingAlarm(A_SW, '안녕') // 서비스워커가 뒤늦게 — 무시돼야
    expect(getRingingAlarm()?.phrase).toBe('오늘 나는 미루지 않는다')
  })

  it('해제한 뒤 같은 알람이 뒤늦게 다시 울려도 되살아나지 않는다', () => {
    startRingingAlarm(A, '다짐')
    stopRingingAlarm()
    startRingingAlarm(A_SW, '안녕') // 해제 후 도착한 중복 경로
    expect(getRingingAlarm()).toBeNull()
  })

  it('다른 알람은 정상적으로 울린다', () => {
    startRingingAlarm(A, '다짐')
    stopRingingAlarm()
    startRingingAlarm(B, '다른 다짐')
    expect(getRingingAlarm()?.trigger.alarmId).toBe('b2')
  })
})
