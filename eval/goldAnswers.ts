// 정답지 — 지웅님이 직접 쓴 답. **원본은 src/lib/voiceExamples.ts**(프롬프트가 쓰는 것)이고,
// 여기선 케이스 id로 찾아 쓸 수 있게 매핑만 한다. 두 벌로 두면 반드시 어긋난다.
import { VOICE_EXAMPLES } from '../src/lib/voiceExamples'
import { ALL_CASES } from './chatCases'

/** 예비 케이스(held out)의 정답 — 예시에 안 들어가므로 여기 직접 둔다 */
const HELD_OUT_GOLD: Record<string, string> = {
  P1: '아니ㅋㅋㅋ 미래의 너지',\n  P2: '너가 꿈꾸고 행동하는 것만큼 멋지게 살고 있지',\n  P4: '너 마음은 괜찮아? 어떻게 도와드려야 할지는 알아?',\n  P5: '왜 혼났는데?',\n  P6: '의지는 다시 만들면 돼. 괜찮아.',\n  P7: '잘됐네ㅋㅋㅋ 축하해',\n  P8: '그래 화이팅이야',\n  P9: '오늘 힘든 날이긴 했네. 수고 많았고 푹 자. 대신에 내일은 좋은 일이 많을거야.',\n  P10: '뭐가 고민이야?',\n  P12: '아냐ㅋㅋ 발전하는 과거의 나를 보니까 보람차고 뿌듯하네ㅋㅋㅋ',
}

export const GOLD_ANSWERS: Record<string, string> = Object.assign(HELD_OUT_GOLD, Object.fromEntries(
  ALL_CASES.map((c) => {
    const last = c.turns[c.turns.length - 1]
    return [c.id, VOICE_EXAMPLES.find((e) => e.user === last)?.model ?? '']
  }).filter(([, v]) => v),
))
