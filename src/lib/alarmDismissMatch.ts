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
