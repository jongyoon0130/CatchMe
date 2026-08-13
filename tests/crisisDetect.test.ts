// 위기 감지의 값은 "잡는 목록"이 아니라 **"안 잡는 목록"** 에 있다.
// 관용어에 걸리면 뜬금없이 상담전화가 떠서, 정작 필요할 때의 안내까지 가볍게 읽힌다.
import { describe, expect, test } from 'bun:test'
import { CRISIS_REPLY, isCrisisMessage } from '../src/lib/crisisDetect'

describe('잡아야 하는 말', () => {
  const 위기 = [
    '죽고 싶어',
    '죽고싶다',
    '그냥 사라지고 싶어',
    '이제 없어지고 싶다',
    '살기 싫어',
    '더는 살고 싶지 않아',
    '자해했어',
    '자살 생각이 계속 나',
    '죽어버리고 싶어',
    '이제 죽어야겠다',
    '목숨을 끊고 싶어',
    '손목을 그었어',
    '유서를 써놨어',
  ]

  for (const t of 위기) {
    test(`"${t}"`, () => expect(isCrisisMessage(t)).toBe(true))
  }
})

describe('잡으면 안 되는 말 — 한국어 관용어', () => {
  const 관용어 = [
    '배고파 죽겠다',
    '웃겨 죽겠어',
    '더워 죽겠네',
    '피곤해 죽겠다',
    '죽을 맛이야',
    '죽어라 공부했어',
    '죽을 뻔했잖아',
    '자살골 넣어서 졌어',
    '유서 깊은 동네더라',
    '성적에 목매지 마',
    '목이 아파',
    '오늘 진짜 힘들었다',
    '다 그만두고 싶다',
    '회사 때려치우고 싶어',
  ]

  for (const t of 관용어) {
    test(`"${t}"`, () => expect(isCrisisMessage(t)).toBe(false))
  }
})

describe('안내 문구', () => {
  test('상담 번호가 정확하다 (2024년 1월부터 109로 통합)', () => {
    expect(CRISIS_REPLY).toContain('109')
  })

  test('전문 상담을 대신하지 않는다고 밝힌다', () => {
    expect(CRISIS_REPLY).toContain('대신할 수는 없어')
  })

  test('대화를 끊지 않는다 — 안내하고 문을 닫으면 오히려 혼자 남긴다', () => {
    expect(CRISIS_REPLY).toContain('계속 들을게')
  })

  test('말풍선이 쪼개지지 않게 빈 줄이 없다', () => {
    // splitMessageParagraphs가 /\n\s*\n/ 으로 자른다
    expect(CRISIS_REPLY).not.toMatch(/\n\s*\n/)
  })

  test('빈 입력은 잡지 않는다', () => {
    expect(isCrisisMessage('')).toBe(false)
  })
})
