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
