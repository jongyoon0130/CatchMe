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
import { geminiGenerateContent, resolveModel } from './selfEngine'

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
1. **사람·사건·장소·직업은 만들지 말 것.** 위 답에 없는 인물이나 일을 지어내면 남의 이야기가 된다.
   재료가 모자라면 개수를 줄여라. 지어내는 것보다 3개가 낫다.
   대신 **시간·정도·감정은 채워도 된다** — "그 여름날", "밤새", "뒤처지는 기분에" 같은 것.
   그게 있어야 회상이 되고, 없으면 위 답을 그대로 되풀이하는 것에 그친다.
2. **내 회상만.** 1인칭으로 "~했다", "~하더라". 예언·단정 금지 — "너는 ~하게 될 거야"는 절대 금지.
   **user를 평가하지 말 것** — "네가 정말 대견해", "네가 버틴 선물" 같은 2인칭 칭찬은 회상이 아니다.
   나중에 "나도 그때 ~하더라"로 꺼내 쓸 재료여야 한다. 칭찬은 그 자리에서 할 말이지 기억이 아니다.
3. **장면 하나씩, 한 줄.** 교훈이나 요약이 아니라 그날 있었던 일.
   나쁜 예: "꾸준함이 중요하다는 걸 배웠다"
   좋은 예: "3년차 봄에 진짜 그만둘까 했는데 두 달만 더 해보자 하고 버텼다"
4. **모든 기억은 넘어선 이야기여야 한다.** 힘들었던 장면으로 끝내지 말 것.
   힘든 대목을 쓸 거면 **그래서 어떻게 됐는지까지 한 줄 안에** 담아라.
   너는 이미 그 길을 지나온 쪽이다. **지나왔다는 게 이 기억의 핵심**이다.
   ❌ "포트폴리오가 안 써져서 노트북을 덮어버린 적도 많아" ← 거기서 끝나면 미래의 나가 우울한 사람이 된다
   ✅ "포트폴리오 한 줄이 안 써져서 노트북 덮었는데, 그래도 다음 날 또 열더라"
5. **그렇다고 다 쉬웠던 것처럼 쓰지도 말 것.** 처음부터 술술 풀린 회상만 있으면
   격려가 아니라 잘난 척이 되고, user는 자기만 못난 것처럼 느낀다.
   막힌 대목은 **짧게 스치고**, 무게는 넘어선 쪽에 둔다.
6. 반말. 40자 안팎.

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

/**
 * 기억을 한 번 만든다. **실패해도 던지지 않는다** — 빈 배열을 준다.
 *
 * 온보딩 마지막에 부르는 자리라, 여기서 에러가 나면 유저는 다 채워놓고 벽을 본다.
 * 기억이 없어도 대화는 그대로 되므로, 안 되면 조용히 없는 채로 두고 다음에 다시 시도한다.
 */
export async function generateFutureMemories(
  p: SelfProfile,
  apiKey: string,
  model?: string,
): Promise<string[]> {
  if (!apiKey.trim() || !hasEnoughMaterial(p)) return []
  try {
    const data = await geminiGenerateContent(
      apiKey,
      resolveModel(model),
      // 생성 옵션을 일부러 주지 않는다 — eval/memories.ts(미리보기)와 **같은 요청**이어야
      // 미리보기로 판단한 결과가 앱에서도 그대로 나온다. 여기만 온도를 바꾸면 둘이 갈라진다.
      { contents: [{ role: 'user', parts: [{ text: buildFutureMemoryPrompt(p) }] }] },
      'futureMemories',
    )
    const text = (data?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]
      ?.content?.parts?.map((x) => x.text ?? '')
      .join('')
      .trim()
    return dropPredictions(parseFutureMemories(text ?? ''))
  } catch {
    return []
  }
}
