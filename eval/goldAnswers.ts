// 정답지 — 지웅님이 직접 쓴 답. **원본은 src/lib/voiceExamples.ts**(프롬프트가 쓰는 것)이고,
// 여기선 케이스 id로 찾아 쓸 수 있게 매핑만 한다. 두 벌로 두면 반드시 어긋난다.
import { VOICE_EXAMPLES } from '../src/lib/voiceExamples'
import { ALL_CASES } from './chatCases'

export const GOLD_ANSWERS: Record<string, string> = Object.fromEntries(
  ALL_CASES.map((c) => {
    const last = c.turns[c.turns.length - 1]
    return [c.id, VOICE_EXAMPLES.find((e) => e.user === last)?.model ?? '']
  }).filter(([, v]) => v),
)
