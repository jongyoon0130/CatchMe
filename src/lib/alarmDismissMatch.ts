/** phrase 앞부분과 일치하는 typed의 최장 접두사 (줄바꿈은 입력 생략 가능) */
export function longestMatchingPrefix(phrase: string, typed: string): string {
  let pi = 0
  let ti = 0
  while (pi < phrase.length && ti < typed.length) {
    const expected = phrase[pi]!
    const got = typed[ti]!
    if (expected === got) {
      pi++
      ti++
      continue
    }
    if (expected === '\n') {
      pi++
      continue
    }
    if (got === '\n') {
      ti++
      continue
    }
    break
  }
  return typed.slice(0, ti)
}

/**
 * 화면·textarea 표시용 — 다음 줄 글자를 치는 순간 phrase의 줄바꿈을 자동 삽입.
 * (Enter 없이 이어 쳐도 줄이 맞게 보이도록)
 */
export function alignTypedDisplay(phrase: string, raw: string): string {
  let pi = 0
  let ti = 0
  let out = ''

  while (ti < raw.length) {
    while (pi < phrase.length && phrase[pi] === '\n') {
      out += '\n'
      pi++
    }

    const got = raw[ti]!
    if (got === '\n') {
      ti++
      continue
    }

    if (pi < phrase.length && phrase[pi] === got) {
      out += got
      pi++
      ti++
      continue
    }

    out += got
    ti++
  }

  return out
}

/** 다음에 쳐야 할 글자 — null이면 입력 완료 */
export function nextExpectedChar(phrase: string, typed: string): string | null {
  let pi = 0
  let ti = 0
  while (pi < phrase.length && ti < typed.length) {
    const expected = phrase[pi]!
    const got = typed[ti]!
    if (expected === '\n') {
      pi++
      continue
    }
    if (got === '\n') {
      ti++
      continue
    }
    if (expected === got) {
      pi++
      ti++
      continue
    }
    return expected
  }
  while (pi < phrase.length && phrase[pi] === '\n') pi++
  return pi < phrase.length ? phrase[pi]! : null
}

/** 줄 끝까지 맞췄고, 다음은 줄바꿈(자동) 뒤 다음 줄 */
export function isAwaitingNextLine(phrase: string, typed: string): boolean {
  let pi = 0
  let ti = 0
  while (pi < phrase.length && ti < typed.length) {
    const expected = phrase[pi]!
    const got = typed[ti]!
    if (expected === '\n') {
      pi++
      continue
    }
    if (got === '\n') {
      ti++
      continue
    }
    if (expected === got) {
      pi++
      ti++
      continue
    }
    return false
  }
  return pi < phrase.length && phrase[pi] === '\n'
}

/**
 * 조합 중인 한글 낱자(ㅇ, ㅗ, ㅏ …) — **아직 틀린 게 아니다.**
 *
 * "오"는 ㅇ→ㅗ 두 단계로 완성된다. 첫 단계 "ㅇ"을 "오와 다르다"고 버리면
 * React가 textarea 값을 되돌리고, 그 순간 iOS 키보드의 조합이 깨진다
 * → **한글을 한 글자도 못 치고 알람이 안 꺼진다** (2026-08-06 폰에서 발생).
 * 조합이 끝나야 맞는지 틀리는지 판정할 수 있으므로, 끝 낱자는 그대로 남긴다.
 */
const TRAILING_JAMO = /[ㄱ-ㆎ]$/

export function normalizeTypedInput(phrase: string, raw: string): string {
  if (TRAILING_JAMO.test(raw)) {
    const composing = raw.slice(-1)
    return alignTypedDisplay(phrase, commitTypedPrefix(phrase, raw.slice(0, -1))) + composing
  }
  return alignTypedDisplay(phrase, commitTypedPrefix(phrase, raw))
}

export function commitTypedPrefix(phrase: string, raw: string): string {
  if (phraseFullyMatched(phrase, raw)) return raw
  return longestMatchingPrefix(phrase, raw)
}

/** 줄바꿈 없이 이어 쳐도 3줄 다짐 전체가 맞으면 true */
export function phraseFullyMatched(phrase: string, typed: string): boolean {
  let pi = 0
  let ti = 0
  while (pi < phrase.length || ti < typed.length) {
    if (pi < phrase.length && phrase[pi] === '\n') {
      pi++
      continue
    }
    if (ti < typed.length && typed[ti] === '\n') {
      ti++
      continue
    }
    if (pi >= phrase.length || ti >= typed.length) break
    if (phrase[pi] !== typed[ti]) return false
    pi++
    ti++
  }
  while (pi < phrase.length && phrase[pi] === '\n') pi++
  while (ti < typed.length && typed[ti] === '\n') ti++
  return pi === phrase.length && ti === typed.length
}

export function dismissMatchProgress(phrase: string, typed: string): number {
  const targetLen = phrase.replace(/\n/g, '').length
  if (!targetLen) return 0
  const matched = longestMatchingPrefix(phrase, typed).replace(/\n/g, '').length
  return Math.min(100, Math.round((matched / targetLen) * 100))
}

export type PhraseCharState =
  | { kind: 'pending'; char: string }
  | { kind: 'correct'; char: string }
  | { kind: 'wrong'; typed: string }
  | { kind: 'extra'; char: string }

/** 따라치기 UI — 줄바꿈은 자동 넘김, 오타는 red */
export function phraseMatchStates(phrase: string, typed: string): PhraseCharState[] {
  const out: PhraseCharState[] = []
  let ti = 0

  for (let pi = 0; pi < phrase.length; pi++) {
    const expected = phrase[pi]!
    if (expected === '\n') {
      if (typed[ti] === '\n') ti++
      out.push({ kind: 'correct', char: '\n' })
      continue
    }
    if (ti >= typed.length) {
      out.push({ kind: 'pending', char: expected })
      continue
    }
    if (typed[ti] === '\n') {
      ti++
      pi--
      continue
    }
    if (typed[ti] === expected) {
      out.push({ kind: 'correct', char: expected })
      ti++
    } else {
      out.push({ kind: 'wrong', typed: typed[ti]! })
      ti++
    }
  }

  while (ti < typed.length) {
    if (typed[ti] === '\n') {
      ti++
      continue
    }
    out.push({ kind: 'extra', char: typed[ti]! })
    ti++
  }

  return out
}
