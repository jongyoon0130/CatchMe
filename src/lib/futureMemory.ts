// ---------------------------------------------------------------------------
// 미래의 나의 기억 (합성 기억)
//
// 지금은 온보딩 답 몇 줄을 프롬프트에 그대로 싣고 "낭독하지 말 것"이라고 금지한다.
// 재료는 4~5줄뿐인데 낭독은 금지니, 모델이 꺼낼 게 없어 매번 비슷한 소리를 한다.
//
// 그래서 온보딩이 끝날 때 **한 번만** 그 답들을 재료로 "그 5년을 살아본 사람의
// 회상" 몇 개를 만들어 저장한다. 허구를 늘리는 게 아니라 **고정**하는 것이다 —
// 지금도 매 대화마다 즉석에서 지어내고 있고, 그래서 어제와 오늘 얘기가 다르다.
//
// 앱에 배선하기 전에 eval/memories.ts로 결과부터 눈으로 본다.
// ---------------------------------------------------------------------------
import type { SelfProfile } from '../types/self'
import { renderFutureSelfBlock } from './personaModel'
import { FUTURE_YEARS_AHEAD } from './brand'

export const FUTURE_MEMORY_COUNT = 5

/** 온보딩 답이 너무 비면 기억을 만들 재료가 없다 — 지어내기만 한다 */
export function hasEnoughMaterial(p: SelfProfile): boolean {
  const block = renderFutureSelfBlock(p)
  return block.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 3
}

export function buildFutureMemoryPrompt(p: SelfProfile): string {
  const name = p.name?.trim() || '나'
  return `너는 ${name}의 ${FUTURE_YEARS_AHEAD}년 뒤 모습이다. 아래는 ${name}이 온보딩에서 직접 쓴 답이다.

## ${name}의 지금
- 나이: ${p.age}세
- 요즘 상황: ${p.lifeContext?.trim() || '(안 씀)'}

## ${name}이 그리는 ${FUTURE_YEARS_AHEAD}년 뒤
${renderFutureSelfBlock(p)}

---

위 답을 재료로, **그 ${FUTURE_YEARS_AHEAD}년을 실제로 살아본 사람의 회상** ${FUTURE_MEMORY_COUNT}개를 써라.
나중에 대화에서 "나도 그때 ~하더라" 하고 꺼내 쓸 재료다.

규칙:
1. **위 답에 적힌 것 밖으로 나가지 말 것.** 안 쓴 사람·사건·직업·관계를 새로 만들지 말 것.
   재료가 모자라면 개수를 줄여라. 지어내는 것보다 3개가 낫다.
2. **회상만.** "~했다", "~하더라". 예언·단정 금지 — "너는 ~하게 될 거야"는 절대 금지.
3. **장면 하나씩, 한 줄.** 교훈이나 요약이 아니라 그날 있었던 일.
   나쁜 예: "꾸준함이 중요하다는 걸 배웠다"
   좋은 예: "3년차 봄에 진짜 그만둘까 했는데 두 달만 더 해보자 하고 버텼다"
4. **좋은 기억만 쓰지 말 것.** 흔들린 순간·포기할 뻔한 순간을 최소 2개 넣어라.
   다 잘 풀린 회상만 있으면 위로가 안 되고 잘난 척이 된다.
5. 반말. 40자 안팎.

JSON 배열로만 출력. 설명 금지.
["...", "...", "..."]`
}

/** 모델이 코드펜스로 감싸도 읽는다 */
export function parseFutureMemories(raw: string): string[] {
  const text = raw.replace(/```(?:json)?/g, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, FUTURE_MEMORY_COUNT)
  } catch {
    return []
  }
}

/** 예언조가 섞여 나오면 그 줄만 버린다 — 규칙 2를 코드로도 막는다 */
export function dropPredictions(memories: string[]): string[] {
  return memories.filter((m) => !/(할|될|갈|올|볼|들|받|생기)\s*거야|하게 될|것이다/.test(m))
}
