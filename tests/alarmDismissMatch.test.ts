import { describe, expect, it } from 'vitest'
import {
  alignTypedDisplay,
  commitTypedPrefix,
  dismissMatchProgress,
  hasWrongInput,
  isAwaitingNextLine,
  longestMatchingPrefix,
  nextExpectedChar,
  normalizeTypedInput,
  phraseFullyMatched,
  phraseMatchStates,
} from '../src/lib/alarmDismissMatch'

describe('alarmDismissMatch', () => {
  it('keeps longest valid prefix', () => {
    const phrase = '나는 오늘도\n한 걸음'
    expect(longestMatchingPrefix(phrase, '나는 오')).toBe('나는 오')
    expect(longestMatchingPrefix(phrase, '나는 틀')).toBe('나는 ')
  })

  it('matches 3 lines without explicit newlines', () => {
    const phrase = '첫째줄이다\n둘째줄이다\n셋째줄이다'
    const typed = '첫째줄이다둘째줄이다셋째줄이다'
    expect(phraseFullyMatched(phrase, typed)).toBe(true)
    expect(dismissMatchProgress(phrase, typed)).toBe(100)
  })

  it('commits exact prefix', () => {
    const phrase = 'abc'
    expect(commitTypedPrefix(phrase, 'ab')).toBe('ab')
    expect(commitTypedPrefix(phrase, 'ax')).toBe('a')
  })

  it('aligns display newlines when typing continues without Enter', () => {
    const phrase = '첫째줄이다\n둘째줄이다'
    expect(alignTypedDisplay(phrase, '첫째줄이다')).toBe('첫째줄이다')
    expect(alignTypedDisplay(phrase, '첫째줄이다둘')).toBe('첫째줄이다\n둘')
    expect(isAwaitingNextLine(phrase, '첫째줄이다')).toBe(true)
    expect(nextExpectedChar(phrase, '첫째줄이다')).toBe('둘')
  })

  it('normalizes raw input with auto newlines and prefix commit', () => {
    const phrase = 'abc\ndef'
    expect(normalizeTypedInput(phrase, 'abc')).toBe('abc')
    expect(normalizeTypedInput(phrase, 'abcd')).toBe('abc\nd')
    expect(normalizeTypedInput(phrase, 'abcx')).toBe('abc')
  })

  it('marks wrong syllables red state', () => {
    const states = phraseMatchStates('박종윤', '밥종')
    expect(states[0]).toEqual({ kind: 'wrong', typed: '밥' })
    expect(states[1]).toEqual({ kind: 'correct', char: '종' })
    expect(states[2]).toEqual({ kind: 'pending', char: '윤' })
  })

  // --- raw 입력 모델 (IME 안전) — 입력값은 재작성하지 않고 상태만 계산한다 ---

  it('IME 조합 중간 자모는 wrong으로 보이고, 조합 완성 후 correct가 된다', () => {
    const phrase = '안녕'
    // 조합 중간: "ㅇ" — 자르지 않고 wrong으로 표시만
    const mid = phraseMatchStates(phrase, 'ㅇ')
    expect(mid[0]).toEqual({ kind: 'wrong', typed: 'ㅇ' })
    expect(mid[1]).toEqual({ kind: 'pending', char: '녕' })
    // 조합 완성: "안" — correct
    const donePart = phraseMatchStates(phrase, '안')
    expect(donePart[0]).toEqual({ kind: 'correct', char: '안' })
    expect(phraseFullyMatched(phrase, '안녕')).toBe(true)
  })

  it('hasWrongInput — 틀린 글자·초과 입력 감지', () => {
    expect(hasWrongInput('안녕', '아')).toBe(true)
    expect(hasWrongInput('안녕', '안')).toBe(false)
    expect(hasWrongInput('안녕', '안녕하')).toBe(true) // extra
  })

  it('스마트 문장부호는 같은 글자로 취급 (iOS 자동 변환 대비)', () => {
    expect(phraseFullyMatched("it's", 'it\u2019s')).toBe(true)
    expect(phraseFullyMatched('a-b', 'a\u2013b')).toBe(true)
    expect(phraseFullyMatched('a b', 'a\u00A0b')).toBe(true)
  })

  it('NFC 정규화 — 자소 분리된 입력도 맞는 것으로', () => {
    const decomposed = '안녕'.normalize('NFD')
    expect(phraseFullyMatched('안녕', decomposed)).toBe(true)
  })

  it('typed 안의 Enter(줄바꿈)는 어디서든 무해하다', () => {
    const phrase = '첫줄\n둘줄'
    expect(phraseFullyMatched(phrase, '첫줄\n둘줄')).toBe(true)
    expect(phraseFullyMatched(phrase, '첫줄둘줄')).toBe(true)
    expect(phraseFullyMatched(phrase, '첫\n줄둘줄')).toBe(true) // 줄 중간 Enter도 무시
    const states = phraseMatchStates(phrase, '첫\n줄')
    expect(states.filter((s) => s.kind === 'correct' && s.char !== '\n')).toHaveLength(2)
  })

  it('커서 위치 = 첫 pending — 틀린 글자 뒤에 온다', () => {
    const states = phraseMatchStates('박종윤', '밥')
    const cursorAt = states.findIndex((s) => s.kind === 'pending')
    expect(cursorAt).toBe(1) // wrong(밥) 다음
  })
})
