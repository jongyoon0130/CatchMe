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
1. **사람·사건·장소·직업·사물·습관은 만들지 말 것.** 위 답에 없는 걸 지어내면 남의 이야기가 된다.
   특히 **먹는 것·마시는 것·물건** 같은 사소한 소품을 조심해라 — 그럴듯해서 슬쩍 들어가는데,
   user는 그런 걸 제일 먼저 알아챈다. ("밤에 컵라면 먹으면서" ← 안 쓴 사람에겐 남 얘기다)
   재료가 모자라면 개수를 줄여라. 지어내는 것보다 3개가 낫다.
   대신 **시간·정도·감정은 채워도 된다** — "그 여름날", "밤새", "뒤처지는 기분에" 같은 것.
   그게 있어야 회상이 되고, 없으면 위 답을 그대로 되풀이하는 것에 그친다.
2. **내 회상만.** 1인칭으로 "~했다", "~하더라". 예언·단정 금지 — "너는 ~하게 될 거야"는 절대 금지.
   **user를 평가하지 말 것** — "네가 정말 대견해", "네가 버틴 선물" 같은 2인칭 칭찬은 회상이 아니다.
   나중에 "나도 그때 ~하더라"로 꺼내 쓸 재료여야 한다. 칭찬은 그 자리에서 할 말이지 기억이 아니다.
3. **장면 하나씩, 한 줄.** 교훈이나 요약이 아니라 그날 있었던 일.
   나쁜 예: "꾸준함이 중요하다는 걸 배웠다"
   좋은 예: "3년차 봄에 진짜 그만둘까 했는데 두 달만 더 해보자 하고 버텼다"
4. **${FUTURE_MEMORY_COUNT}개가 서로 다른 결이어야 한다.** 같은 모양을 반복하면 기억이 아니라 공식이 된다.
   특히 "힘들었지만 결국 해냈어"만 다섯 번 쓰면 그게 제일 뻔하다.
   아래에서 **골고루** 뽑아라. 한 결에 몰리지 말 것:
   · **넘어선 것** — "막막했는데 한 줄씩 짜다 보니 끝내 됐어"
   · **결과를 아는 것** — "그거 결국 이렇게 되더라"
   · **시간이 지워준 것** — "그때 그렇게 걱정했는데 지금은 기억도 안 나"
     단 **무엇이 지워졌는지 장면이 있어야 한다.** "그 마음이 없어져 있더라"처럼
     대상 없이 흐릿하면 아무 말도 안 한 것과 같다.
   · **그냥 좋았던 장면** — 교훈도 극복도 없이, 그날이 그냥 좋았던 것.
     **반드시 과거형으로.** 지금도 그러고 있다고 단정하지 말 것 —
     취미·관계는 5년 사이에 바뀐다. 지나온 시절의 장면이지 미래의 일상이 아니다.
   · **예상 못 한 것** — 그때의 내가 **안 할 것 같던 일을 지금 하고 있는 것.**
     "이렇게 될 줄 몰랐는데 요즘은 ~하고 있어"처럼 **지금 하는 행동**으로 끝내라.
     단 없는 취미·직업을 새로 만들지 말고, 위 답에 적힌 것을 **방향만 틀어라** —
     싫어하던 걸 하게 됐다 / 미루던 걸 먼저 하게 됐다 / 혼자 하던 걸 같이 하게 됐다.
5. **힘든 대목에서 끝내지 말 것.** 힘든 얘기를 쓸 거면 그게 어떻게 됐는지까지 한 줄에 담아라.
   ❌ "포트폴리오가 안 써져서 노트북을 덮어버린 적도 많아" ← 거기서 끝나면 미래의 나가 우울한 사람이 된다
   ✅ "포트폴리오 한 줄이 안 써져서 노트북 덮었는데, 그래도 다음 날 또 열더라"
   **그렇다고 다 쉬웠던 것처럼 쓰지도 말 것** — 격려가 아니라 잘난 척이 되고,
   user는 자기만 못난 것처럼 느낀다. 막힌 대목은 **짧게 스치고** 지나가라.
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

// ---------------------------------------------------------------------------
// 대화 중 정정 — user가 "그런 적 없는데" 하면 그 기억을 버린다.
//
// 온보딩 끝에 체크박스로 검사받게 하는 안은 접었다(지웅님: "유저가 그걸 하는 게
// 안 귀찮고 흥미로울까?"). 게다가 아직 일어나지 않은 미래의 기억이라 그 자리에선
// 맞는지 판단할 수도 없다. 틀린 걸 진짜로 알아채는 순간은 **대화 중 그 얘기가 나왔을 때**다.
//
// **놓치는 건 괜찮고, 잘못 지우는 건 안 된다.** 못 잡으면 user가 한 번 더 말하면 되지만
// 멀쩡한 기억을 지우면 되돌릴 방법이 없다(기억은 온보딩 때 한 번만 만든다).
// 그래서 아래 세 개를 **전부** 만족할 때만 지운다.
// ---------------------------------------------------------------------------

/** 지금 얘기면 5년치 회상에 대한 정정이 아니다 — "오늘 운동 안 했어"로 기억이 지워지면 안 된다 */
const PRESENT_MARKER = /(오늘|어제|내일|모레|지금|요즘|이번|아까|방금|올해|이번주)/

/**
 * **단순 부정("운동 안 했어")이 아니라 정정일 때만** 잡는다.
 * `-는데/-은데`(대조 어미), `~한 적 없`, 대조 조사 `은/는` + 부정 — 남의 말을 바로잡는 자리다.
 */
const CORRECTION = /(안|못) ?[가-힣]*(는데|은데|던데)|적 ?(이 )?없|아닌데|아니야|아니었|내가 ?언제|틀렸|잘못 ?알|착각/

/** 어느 기억에나 흔해서 근거가 못 되는 말 */
const TOO_COMMON = new Set([
  '그거', '그런', '그때', '나도', '내가', '진짜', '정말', '근데', '이거', '저거',
  '우리', '얘기', '생각', '기억', '사람', '하는', '했던', '하고', '그리고', '별로',
])

/**
 * user가 방금 부정한 기억의 번호. 없으면 null.
 *
 * `lastSelfReply`(미래의 나의 직전 답)를 반드시 받는다 — 정정은 **방금 꺼낸 기억**에
 * 대해서만 일어난다. 이 조건이 없으면 "운동 안 했어" 한마디에 운동 관련 기억이 지워진다.
 */
export function findDeniedMemory(
  memories: string[],
  userText: string,
  lastSelfReply: string,
): number | null {
  if (!memories.length || !userText.trim() || !lastSelfReply.trim()) return null
  if (PRESENT_MARKER.test(userText)) return null
  if (!CORRECTION.test(userText)) return null

  const words = (userText.match(/[가-힣]{2,}/g) ?? []).filter((w) => !TOO_COMMON.has(w))
  if (!words.length) return null

  for (let i = 0; i < memories.length; i++) {
    // user가 말했고 · 그 기억에 있고 · 미래의 나가 방금 꺼낸 말이어야 한다
    if (words.some((w) => memories[i]!.includes(w) && lastSelfReply.includes(w))) return i
  }
  return null
  // ponytail: 단어 겹침으로만 고른다. "운동 안 했는데"처럼 정정 어미를 쓰면서 실은 오늘 얘기인
  // 경우를 못 가른다. 지워지는 건 합성 기억 한 줄뿐이라 손해가 작아 이대로 둔다.
  // 실사용에서 멀쩡한 기억이 지워지는 게 관찰되면 그때 직전 답과의 겹침 개수를 2개로 올릴 것.
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
