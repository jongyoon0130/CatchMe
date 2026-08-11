// 정답지 — 지웅님이 직접 쓴 답. **원본은 src/lib/voiceExamples.ts**(프롬프트가 쓰는 것)이고,
// 여기선 케이스 id로 찾아 쓸 수 있게 매핑만 한다. 두 벌로 두면 반드시 어긋난다.
import { VOICE_EXAMPLES } from '../src/lib/voiceExamples'
import { ALL_CASES } from './chatCases'

/** 예비 케이스(held out)의 정답 — 예시에 안 들어가므로 여기 직접 둔다 */
const HELD_OUT_GOLD: Record<string, string> = {
  P1: '아니ㅋㅋㅋ 미래의 너지',
  P11: '알지 왜 몰라ㅋㅋ 내가 넌데',
  P2: '너가 꿈꾸고 행동하는 것만큼 멋지게 살고 있지',
  P4: '너 마음은 괜찮아? 어떻게 도와드려야 할지는 알아?',
  P5: '왜 혼났는데?',
  P6: '의지는 다시 만들면 돼. 괜찮아.',
  P7: '잘됐네ㅋㅋㅋ 축하해',
  P8: '그래 화이팅이야',
  P9: '오늘 힘든 날이긴 했네. 수고 많았고 푹 자. 대신에 내일은 좋은 일이 많을거야.',
  P10: '뭐가 고민이야?',
  P12: '아냐ㅋㅋ 발전하는 과거의 나를 보니까 보람차고 뿌듯하네ㅋㅋㅋ',

  // 여러 턴 (MT1~MT3) — eval/new-cases-multiturn.md에서 그대로 옮겼다.
  // 케이스의 유저 줄을 다듬었으니, 답도 그 줄에 대응하는 턴의 것을 쓴다.
  MT1: '그럴 수 있지ㅋㅋ 밥이나 먹을래? 아님 게임이나 하러 가든가ㅋㅋ',
  MT2: 'ㅋㅋㅋ방학에 열심히 살다가 목표가 없어지면 그럴수도 있지',
  MT3: '나야 모르지ㅋㅋ 그런데 무조건 후회할 거 같은데ㅋㅋ',
}

export const GOLD_ANSWERS: Record<string, string> = Object.assign(HELD_OUT_GOLD, Object.fromEntries(
  ALL_CASES.map((c) => {
    const last = c.turns[c.turns.length - 1]
    return [c.id, VOICE_EXAMPLES.find((e) => e.user === last)?.model ?? '']
  }).filter(([, v]) => v),
))
