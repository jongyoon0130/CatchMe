/** phrase 앞부분과 일치하는 typed의 최장 접두사 */
export function longestMatchingPrefix(phrase: string, typed: string): string {
  let valid = ''
  for (let i = 0; i < typed.length; i++) {
    const prefix = typed.slice(0, i + 1)
    if (phrase.startsWith(prefix)) valid = prefix
    else break
  }
  return valid
}

export function commitTypedPrefix(phrase: string, raw: string): string {
  if (phrase.startsWith(raw)) return raw
  return longestMatchingPrefix(phrase, raw)
}

export type PhraseCharState =
  | { kind: 'pending'; char: string }
  | { kind: 'correct'; char: string }
  | { kind: 'wrong'; typed: string }
  | { kind: 'extra'; char: string }

/** 따라치기 UI — 글자별 상태 (오타는 red, 미입력은 gray ghost) */
export function phraseMatchStates(phrase: string, typed: string): PhraseCharState[] {
  const out: PhraseCharState[] = []
  for (let i = 0; i < phrase.length; i++) {
    const expected = phrase[i]!
    if (i >= typed.length) {
      out.push({ kind: 'pending', char: expected })
    } else if (typed[i] === expected) {
      out.push({ kind: 'correct', char: expected })
    } else {
      out.push({ kind: 'wrong', typed: typed[i]! })
    }
  }
  for (let i = phrase.length; i < typed.length; i++) {
    out.push({ kind: 'extra', char: typed[i]! })
  }
  return out
}
