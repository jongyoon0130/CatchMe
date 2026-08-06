// ---------------------------------------------------------------------------
// 따라치기 매칭 — 입력값(raw)은 절대 변형하지 않고, 비교만 관대하게 한다.
//
// 왜 이렇게 하나:
//   한글 IME는 "안"을 치는 동안 "ㅇ" 같은 중간 상태를 거친다. 이때 입력값을
//   프로그램이 잘라서 textarea에 되돌려 쓰면 React가 DOM을 리셋하면서 조합이
//   파괴되어 **아무것도 쳐지지 않는 것처럼** 보인다. 그래서 여기 함수들은
//   raw를 받아 상태만 계산하고, 입력값 재작성은 하지 않는 전제로 쓴다.
//
// 비교 관대화:
//   - NFC 정규화 (iOS/macOS 자소 분리 대비)
//   - 굽은따옴표·대시·특수 공백을 기본형으로 취급 (iOS 스마트 문장부호 대비)
//   - 줄바꿈은 양쪽 모두 "없는 글자"로 취급 — Enter를 쳐도, 안 쳐도 된다
// ---------------------------------------------------------------------------

function nfc(s: string): string {
  try {
    return s.normalize('NFC')
  } catch {
    return s
  }
}

/** iOS 스마트 문장부호 등 — 시각적으로 같은 글자는 같은 것으로 */
function canonChar(ch: string): string {
  switch (ch) {
    case '\u2018': // '
    case '\u2019': // '
    case '\u02BC':
      return "'"
    case '\u201C': // "
    case '\u201D': // "
      return '"'
    case '\u2013': // –
    case '\u2014': // —
    case '\u2212': // −
      return '-'
    case '\u00A0': // NBSP
    case '\u3000': // 전각 공백
      return ' '
    default:
      return ch
  }
}

function charsMatch(expected: string, got: string): boolean {
  return canonChar(expected) === canonChar(got)
}

/** phrase 앞부분과 일치하는 typed의 최장 접두사 (줄바꿈은 입력 생략 가능) */
export function longestMatchingPrefix(phrase: string, typed: string): string {
  phrase = nfc(phrase)
  typed = nfc(typed)
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
    if (charsMatch(expected, got)) {
      pi++
      ti++
      continue
    }
    break
  }
  return typed.slice(0, ti)
}

/**
 * 화면·textarea 표시용 — 다음 줄 글자를 치는 순간 phrase의 줄바꿈을 자동 삽입.
 * (지금 오버레이는 입력값을 재작성하지 않으므로 표시 전용 유틸로만 쓰인다)
 */
export function alignTypedDisplay(phrase: string, raw: string): string {
  phrase = nfc(phrase)
  raw = nfc(raw)
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

    if (pi < phrase.length && charsMatch(phrase[pi]!, got)) {
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
  phrase = nfc(phrase)
  typed = nfc(typed)
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
    if (charsMatch(expected, got)) {
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
  phrase = nfc(phrase)
  typed = nfc(typed)
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
    if (charsMatch(expected, got)) {
      pi++
      ti++
      continue
    }
    return false
  }
  return pi < phrase.length && phrase[pi] === '\n'
}

/** @deprecated 오버레이는 더 이상 입력값을 재작성하지 않는다 — 표시 전용 */
export function normalizeTypedInput(phrase: string, raw: string): string {
  return alignTypedDisplay(phrase, commitTypedPrefix(phrase, raw))
}

/** @deprecated 오버레이는 더 이상 입력값을 재작성하지 않는다 */
export function commitTypedPrefix(phrase: string, raw: string): string {
  if (phraseFullyMatched(phrase, raw)) return raw
  return longestMatchingPrefix(phrase, raw)
}

/** 줄바꿈 없이 이어 쳐도 3줄 다짐 전체가 맞으면 true */
export function phraseFullyMatched(phrase: string, typed: string): boolean {
  phrase = nfc(phrase)
  typed = nfc(typed)
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
    if (!charsMatch(phrase[pi]!, typed[ti]!)) return false
    pi++
    ti++
  }
  while (pi < phrase.length && phrase[pi] === '\n') pi++
  while (ti < typed.length && typed[ti] === '\n') ti++
  return pi === phrase.length && ti === typed.length
}

export function dismissMatchProgress(phrase: string, typed: string): number {
  const targetLen = nfc(phrase).replace(/\n/g, '').length
  if (!targetLen) return 0
  const matched = longestMatchingPrefix(phrase, typed).replace(/\n/g, '').length
  return Math.min(100, Math.round((matched / targetLen) * 100))
}

export type PhraseCharState =
  | { kind: 'pending'; char: string }
  | { kind: 'correct'; char: string }
  | { kind: 'wrong'; typed: string }
  | { kind: 'extra'; char: string }

/**
 * 따라치기 UI — 줄바꿈은 자동 넘김, 오타는 red.
 * 반환 배열이 화면 그대로다: correct/wrong은 이미 소비된 입력, pending은 남은 목표,
 * extra는 목표를 넘어서 친 글자. 커서는 "첫 pending 앞" (없으면 맨 끝)이 정확한 위치다.
 */
export function phraseMatchStates(phrase: string, typed: string): PhraseCharState[] {
  phrase = nfc(phrase)
  typed = nfc(typed)
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
    if (charsMatch(expected, typed[ti]!)) {
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

/** 틀린 글자(또는 초과 입력)가 화면에 남아 있는지 — 지우기 안내용 */
export function hasWrongInput(phrase: string, typed: string): boolean {
  return phraseMatchStates(phrase, typed).some((s) => s.kind === 'wrong' || s.kind === 'extra')
}
