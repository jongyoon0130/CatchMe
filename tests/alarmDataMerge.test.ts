// 알람 클라우드 병합 — 삭제 툼스톤이 "지운 알람 부활" 버그를 막는지 확인.
// 시나리오: 기기 A에서 알람 삭제 → 원격에는 아직 살아 있는 옛 사본 → 병합 후에도 삭제 유지.
import { beforeEach, describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(key: string) { return this.map.get(key) ?? null }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  removeItem(key: string) { this.map.delete(key) }
  setItem(key: string, value: string) { this.map.set(key, value) }
}
globalThis.localStorage = new MemoryStorage()

// saveAll이 change 이벤트를 쏘고 백그라운드 동기화를 예약한다 — 테스트에선 무시
if (typeof globalThis.CustomEvent === 'undefined') {
  // @ts-expect-error 테스트 환경 폴리필
  globalThis.CustomEvent = class CustomEvent { constructor(public type: string) {} }
}
// @ts-expect-error 테스트 환경 폴리필 — saveAll의 백그라운드 import(alarmPushClient 등)가
// window.location을 읽으므로 최소한의 형태를 갖춘다
globalThis.window = {
  dispatchEvent: () => true,
  location: { origin: 'http://localhost' },
  navigator: {},
  matchMedia: () => ({ matches: false }),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
}

import { mergeAlarmDataBundles, type AlarmDataBundle } from '../src/lib/alarmDataSync'
import type { UserAlarm } from '../src/lib/userAlarms'

function alarm(partial: Partial<UserAlarm>): UserAlarm {
  return {
    id: 'a1',
    time: '07:00',
    label: '알람',
    enabled: true,
    repeatDays: [0, 1, 2, 3, 4, 5, 6],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...partial,
  }
}

function bundle(alarms: UserAlarm[], updatedAt: number): AlarmDataBundle {
  return { alarms, dismissPhrases: [], settings: { enabled: true }, updatedAt }
}

beforeEach(() => localStorage.clear())

describe('mergeAlarmDataBundles — 알람 툼스톤', () => {
  it('로컬에서 지운 알람(툼스톤)이 원격의 옛 살아있는 사본을 이긴다', () => {
    const local = bundle([alarm({ deletedAt: 2_000, updatedAt: 2_000, enabled: false })], 2_000)
    const remote = bundle([alarm({ updatedAt: 1_000 })], 1_000)

    const merged = mergeAlarmDataBundles(local, remote)
    expect(merged.alarms).toHaveLength(1)
    expect(merged.alarms[0]!.deletedAt).toBe(2_000)
  })

  it('원격 번들이 더 최신이어도, 알람별 updatedAt이 오래된 사본은 삭제를 되돌리지 못한다', () => {
    // 원격 번들 revision이 더 커도(다른 알람 때문에) 이 알람의 삭제는 유지돼야 한다
    const local = bundle([alarm({ deletedAt: 5_000, updatedAt: 5_000, enabled: false })], 5_000)
    const remote = bundle(
      [alarm({ updatedAt: 1_000 }), alarm({ id: 'a2', time: '08:00', updatedAt: 9_000 })],
      9_000,
    )

    const merged = mergeAlarmDataBundles(local, remote)
    const a1 = merged.alarms.find((a) => a.id === 'a1')
    const a2 = merged.alarms.find((a) => a.id === 'a2')
    expect(a1?.deletedAt).toBe(5_000)
    expect(a2?.deletedAt).toBeUndefined()
  })

  it('원격에서 지운 알람은 로컬의 옛 사본을 이긴다 (반대 방향)', () => {
    const local = bundle([alarm({ updatedAt: 1_000 })], 1_000)
    const remote = bundle([alarm({ deletedAt: 3_000, updatedAt: 3_000, enabled: false })], 3_000)

    const merged = mergeAlarmDataBundles(local, remote)
    expect(merged.alarms[0]!.deletedAt).toBe(3_000)
  })

  it('삭제 후 같은 시간에 새로 만든 알람(다른 id)은 정상 병합된다', () => {
    const local = bundle(
      [
        alarm({ deletedAt: 2_000, updatedAt: 2_000, enabled: false }),
        alarm({ id: 'b1', time: '07:00', updatedAt: 2_500 }),
      ],
      2_500,
    )
    const remote = bundle([alarm({ updatedAt: 1_000 })], 1_000)

    const merged = mergeAlarmDataBundles(local, remote)
    expect(merged.alarms.filter((a) => !a.deletedAt)).toHaveLength(1)
    expect(merged.alarms.find((a) => !a.deletedAt)?.id).toBe('b1')
  })
})

describe('userAlarms — 삭제 툼스톤 저장', () => {
  it('deleteUserAlarm은 목록에서 빼지 않고 툼스톤을 남긴다', async () => {
    const { addUserAlarm, deleteUserAlarm, loadUserAlarms, loadUserAlarmsWithDeleted } =
      await import('../src/lib/userAlarms')
    const created = addUserAlarm({ time: '07:30', label: '테스트' })
    deleteUserAlarm(created.id)

    expect(loadUserAlarms().find((a) => a.id === created.id)).toBeUndefined()
    const tombstone = loadUserAlarmsWithDeleted().find((a) => a.id === created.id)
    expect(tombstone?.deletedAt).toBeGreaterThan(0)
  })

  it('삭제 후 새 알람을 추가해도 툼스톤이 사라지지 않는다', async () => {
    const { addUserAlarm, deleteUserAlarm, loadUserAlarms, loadUserAlarmsWithDeleted } =
      await import('../src/lib/userAlarms')
    localStorage.clear()
    const first = addUserAlarm({ time: '06:00', label: '첫째' })
    deleteUserAlarm(first.id)
    addUserAlarm({ time: '09:00', label: '둘째' })

    expect(loadUserAlarms()).toHaveLength(1)
    expect(loadUserAlarmsWithDeleted()).toHaveLength(2)
  })
})
