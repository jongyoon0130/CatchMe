// ---------------------------------------------------------------------------
// 미래의 나의 기억 — 미리보기 (앱은 하나도 안 바뀐다)
//
//   bun run memories:preview ~/Downloads/futureme-backup-지웅-2026-08-07.json
//
// API 키는 터미널에 치지 말 것 (셸 히스토리에 남는다).
// 저장소 루트에 .env.local 파일을 만들고 이렇게 한 줄만:
//
//   GEMINI_API_KEY=키
//
// (.env* 는 .gitignore에 있어서 커밋되지 않는다. bun이 알아서 읽는다.)
// ---------------------------------------------------------------------------
import type { SelfProfile } from '../src/types/self'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}
globalThis.localStorage = new MemStorage()

const { buildFutureMemoryPrompt, parseFutureMemories, dropPredictions, hasEnoughMaterial } =
  await import('../src/lib/futureMemory')
const { DEFAULT_GEMINI_MODEL } = await import('../src/lib/selfEngine')

const die = (msg: string): never => {
  console.error(`\n${msg}\n`)
  process.exit(1)
}

const path = process.argv[2]
if (!path) {
  die(
    '백업 파일 경로가 필요합니다.\n' +
      '  앱 → 프로필 → 백업 내보내기(.json) 로 받은 파일을 주세요.\n\n' +
      '  bun run memories:preview ~/Downloads/futureme-backup-이름-날짜.json',
  )
}

const apiKey = process.env.GEMINI_API_KEY?.trim()
if (!apiKey) {
  die(
    'GEMINI_API_KEY가 없습니다.\n' +
      '  저장소 루트에 .env.local 파일을 만들고 한 줄만 넣어주세요:\n\n' +
      '    GEMINI_API_KEY=키\n\n' +
      '  (터미널에 직접 치면 셸 히스토리에 키가 남습니다)',
  )
}

const file = Bun.file(path!)
if (!(await file.exists())) die(`파일이 없습니다: ${path}`)

let profile: SelfProfile
try {
  const backup = (await file.json()) as { profile?: SelfProfile }
  if (!backup.profile?.name) throw new Error('no profile')
  profile = backup.profile
} catch {
  die(`백업 파일을 읽지 못했습니다: ${path}\n  앱에서 내보낸 futureme-backup-*.json 이 맞나요?`)
}

if (!hasEnoughMaterial(profile!)) {
  die(
    '온보딩 답이 너무 적어서 기억을 만들 재료가 없습니다.\n' +
      '  (있는 것만으로 지어내면 그게 바로 걱정하시던 "부정확"입니다)',
  )
}

const prompt = buildFutureMemoryPrompt(profile!)
if (process.env.SHOW_PROMPT) console.log(`\n${'─'.repeat(60)}\n${prompt}\n${'─'.repeat(60)}\n`)

console.log(`\n${profile!.name}님의 온보딩 답으로 기억을 만드는 중...\n`)

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey!)}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  },
)
if (!res.ok) die(`Gemini ${res.status}\n${(await res.text()).slice(0, 300)}`)

const data = (await res.json()) as {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}
const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

const all = parseFutureMemories(text)
if (!all.length) die(`읽을 수 있는 답이 안 나왔습니다.\n원문:\n${text.slice(0, 500)}`)

const kept = dropPredictions(all)
const dropped = all.filter((m) => !kept.includes(m))

console.log('미래의 나의 기억\n')
kept.forEach((m, i) => console.log(`  ${i + 1}. ${m}`))
if (dropped.length) {
  console.log('\n예언조라 걸러낸 것:')
  dropped.forEach((m) => console.log(`  ✕ ${m}`))
}

console.log(`
${'─'.repeat(60)}
이걸 보고 판단해주세요:

  1. 내가 온보딩에 쓴 것에서 나왔나?  (없는 얘기를 지어냈으면 탈락)
  2. 매번 다른 얘기를 할 만큼 재료가 되나?
  3. 예언처럼 들리나?  ("~하게 될 거야"면 탈락)
  4. 흔들린 순간이 들어 있나?  (좋은 기억만 있으면 잘난 척이 된다)

앱은 하나도 안 바뀌었습니다. 마음에 드시면 그때 넣습니다.
`)
