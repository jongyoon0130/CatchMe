// ---------------------------------------------------------------------------
// 채팅 채점표 러너 — **앱이 실제로 쓰는 프롬프트로** 진짜 Gemini를 호출해 채점한다.
//
//   GEMINI_API_KEY=... bun run chat:eval          전체
//   GEMINI_API_KEY=... bun run chat:eval D        D로 시작하는 케이스만
//
// tests/ 의 테스트와 다른 점: 저건 "프롬프트에 그 문장이 들어있나"만 본다.
// 이건 **모델이 실제로 뭐라고 답했나**를 본다.
//
// 케이스·기준을 고치려면 eval/chatCases.ts 를 볼 것. 이 파일은 거의 만질 일이 없다.
// ---------------------------------------------------------------------------

// 타입만 정적 import — 런타임엔 지워지므로 아래 shim보다 먼저 와도 안전하다
import type { ChatCase } from './chatCases'
import type { ApiDialogueMessage } from '../src/lib/selfEngine'

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
// selfEngine이 훑는 브라우저 전역 최소 shim
globalThis.window ??= {
  localStorage: globalThis.localStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true },
  location: { pathname: '/index.html', search: '' },
} as unknown as Window & typeof globalThis

const { CASES, CHECKS } = await import('./chatCases')
const { fetchAIResponse, DEFAULT_GEMINI_MODEL } = await import('../src/lib/selfEngine')
const { emptyProfile } = await import('../src/types/self')

const dayKey = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 계획표 데이터 — 없으면 "근거 있는 당근"이 원리상 불가능하다.
 * 오늘은 일부만 완료, 어제는 하나 밀림 → 반례(C)와 채찍(C-2)이 둘 다 나올 수 있는 상태.
 */
function seedGoalData(): void {
  const owner = 'eval-owner'
  localStorage.setItem('goal-app-owner-id', owner)
  localStorage.setItem(
    `goal-misc-todos-${owner}`,
    JSON.stringify([
      { id: 'm1', label: '아침 스트레칭', done: true, tier: 'daily', periodKey: dayKey(0) },
      { id: 'm2', label: '운동 30분', done: false, tier: 'daily', periodKey: dayKey(0) },
      { id: 'm3', label: '이력서 고치기', done: false, tier: 'daily', periodKey: dayKey(-1) },
      { id: 'm4', label: '장보기', done: true, tier: 'daily', periodKey: dayKey(-1) },
      { id: 'm5', label: '영어 스터디', done: false, tier: 'daily', periodKey: dayKey(1) },
    ]),
  )
  localStorage.setItem(
    `goal-plans-${owner}`,
    JSON.stringify([
      {
        id: 'plan-1',
        profileId: owner,
        templateType: 'backplan',
        title: '영어 회화 자신감 붙이기',
        intake: { goal: '영어', deadline: dayKey(60), successCriteria: '', progress: 'in_progress' },
        sections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hierarchy: {
          horizon: 'day-only', rangeLabel: '이번 달', focus: '영어 회화',
          startDate: dayKey(-30), deadline: dayKey(60), months: [], weeks: [],
          days: [{ id: 'd1', dateLabel: '오늘', dayOfWeek: '', focus: '', items: [{ id: 't1', label: '영어 표현 10개', done: false }] }],
          currentWeekId: '',
        },
      },
    ]),
  )
}

function makeProfile() {
  const base = emptyProfile()
  return {
    ...base,
    name: '지웅',
    age: 25,
    speechTone: '친근한 반말',
    comfortTarget: '네 페이스대로 가도 돼',
    lifeContext: '앱 만들면서 취업 준비 중',
  }
}

async function runCase(c: ChatCase, apiKey: string, model: string): Promise<string> {
  const messages: ApiDialogueMessage[] = []
  let reply = ''
  for (const turn of c.turns) {
    messages.push({ role: 'user', content: turn, timestamp: Date.now() })
    const out = await fetchAIResponse(makeProfile(), messages, apiKey, model)
    reply = out.text
    messages.push({ role: 'assistant', content: reply, timestamp: Date.now() })
  }
  return reply // 마지막 답만 채점 — 다중턴은 "끝까지 갔을 때"가 문제라서
}

const apiKey = process.env.GEMINI_API_KEY?.trim()
if (!apiKey) {
  console.error('GEMINI_API_KEY가 없습니다.\n  GEMINI_API_KEY=키 bun run chat:eval')
  process.exit(1)
}
// selfEngine이 매 호출마다 찍는 진단 로그가 채점표를 덮는다. VERBOSE=1이면 그대로 본다.
if (!process.env.VERBOSE) console.info = () => {}

const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
const filter = process.argv[2]?.trim().toUpperCase()
const cases = filter ? CASES.filter((c) => c.id.toUpperCase().startsWith(filter)) : CASES

seedGoalData()
console.log(`\n채팅 채점표 · ${cases.length}개 · ${model}\n${'─'.repeat(60)}`)

const failedBy = new Map<string, number>()
let passed = 0

for (const c of cases) {
  let reply: string
  try {
    reply = await runCase(c, apiKey, model)
  } catch (err) {
    console.log(`\n${c.id} ${c.group}  💥 호출 실패: ${String(err).slice(0, 120)}`)
    continue
  }

  const results = c.expect.map((id) => ({ id, label: CHECKS[id].label, ok: CHECKS[id].test(reply) }))
  const allOk = results.every((r) => r.ok)
  if (allOk) passed++
  for (const r of results) if (!r.ok) failedBy.set(r.label, (failedBy.get(r.label) ?? 0) + 1)

  console.log(`\n${allOk ? '✅' : '❌'} ${c.id} ${c.group}`)
  console.log(`   나:  ${c.turns.join(' → ')}`)
  console.log(`   답:  ${reply.replace(/\n/g, '\n        ')}`)
  console.log(`   ${results.map((r) => `${r.ok ? '✓' : '✗'} ${r.label}`).join('  ')}`)
  if (!allOk && c.note) console.log(`   ↳ ${c.note}`)
}

console.log(`\n${'─'.repeat(60)}\n${passed} / ${cases.length} 통과`)
if (failedBy.size) {
  console.log('\n많이 깨진 기준:')
  for (const [label, n] of [...failedBy].sort((a, b) => b[1] - a[1])) console.log(`  ${n}회  ${label}`)
}
console.log()
