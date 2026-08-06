// 다짐 문구 고정 — 직접 쓴 다짐은 날짜가 바뀌거나 알람을 다시 저장해도
// 사용자가 새로 쓰거나 AI 버튼을 누르기 전까지 유지된다.
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

if (typeof globalThis.CustomEvent === 'undefined') {
  // @ts-expect-error 테스트 환경 폴리필
  globalThis.CustomEvent = class CustomEvent { constructor(public type: string) {} }
}
// @ts-expect-error 테스트 환경 폴리필 — saveDismissPhrase의 백그라운드 import가 window를 읽는다
globalThis.window = {
  dispatchEvent: () => true,
  location: { origin: 'http://localhost' },
  navigator: {},
  matchMedia: () => ({ matches: false }),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
}

import {
  loadDismissPhrase,
  saveDismissPhrase,
  saveManualDismissPhrase,
  PINNED_DATE_KEY,
} from '../src/lib/alarmDismissPhrase'

beforeEach(() => localStorage.clear())

describe('다짐 문구 고정 (pinned)', () => {
  it('직접 쓴 다짐은 어느 날짜로 조회해도 그대로 나온다', () => {
    saveManualDismissPhrase({ alarmId: 'a1', dateKey: '2026-08-06', phrase: '내가 쓴 다짐' })

    expect(loadDismissPhrase('a1', '2026-08-06')?.phrase).toBe('내가 쓴 다짐')
    // 다음 날에도, 알람을 다시 저장해 dateKey가 바뀌어도 유지
    expect(loadDismissPhrase('a1', '2026-08-07')?.phrase).toBe('내가 쓴 다짐')
    expect(loadDismissPhrase('a1', '2026-08-07')?.source).toBe('manual')
  })

  it('날짜별 자동 생성(ai/fallback)은 고정 다짐을 덮지 못한다', () => {
    saveManualDismissPhrase({ alarmId: 'a1', dateKey: '2026-08-06', phrase: '내가 쓴 다짐' })
    saveDismissPhrase({
      alarmId: 'a1',
      dateKey: '2026-08-07',
      phrase: 'AI가 만든 다짐',
      generatedAt: Date.now() + 10_000,
      source: 'ai',
    })

    expect(loadDismissPhrase('a1', '2026-08-07')?.phrase).toBe('내가 쓴 다짐')
  })

  it('고정 다짐이 없으면 날짜별 문구가 나온다', () => {
    saveDismissPhrase({
      alarmId: 'a1',
      dateKey: '2026-08-07',
      phrase: '오늘의 자동 다짐',
      generatedAt: Date.now(),
      source: 'fallback',
    })

    expect(loadDismissPhrase('a1', '2026-08-07')?.phrase).toBe('오늘의 자동 다짐')
    expect(loadDismissPhrase('a1', '2026-08-08')).toBeNull()
  })

  it('AI 버튼(force)으로 만든 문구는 고정 슬롯을 대체한다', () => {
    saveManualDismissPhrase({ alarmId: 'a1', dateKey: '2026-08-06', phrase: '내가 쓴 다짐' })
    // generateDismissPhraseWithAI(force)가 저장하는 형태와 동일
    saveDismissPhrase({
      alarmId: 'a1',
      dateKey: PINNED_DATE_KEY,
      phrase: '새 AI 다짐',
      generatedAt: Date.now() + 10_000,
      source: 'ai',
    })

    expect(loadDismissPhrase('a1', '2026-08-07')?.phrase).toBe('새 AI 다짐')
  })

  it('다른 알람의 고정 다짐과 섞이지 않는다', () => {
    saveManualDismissPhrase({ alarmId: 'a1', dateKey: '2026-08-06', phrase: '알람1 다짐' })
    saveManualDismissPhrase({ alarmId: 'a2', dateKey: '2026-08-06', phrase: '알람2 다짐' })

    expect(loadDismissPhrase('a1', '2026-08-07')?.phrase).toBe('알람1 다짐')
    expect(loadDismissPhrase('a2', '2026-08-07')?.phrase).toBe('알람2 다짐')
  })
})
