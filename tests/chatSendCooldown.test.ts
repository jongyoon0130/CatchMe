import { describe, expect, it } from 'bun:test'
import { buildReplyPlan, planSend } from '../src/lib/chatReplyPlan'
import type { ChatMessage } from '../src/types/self'

const SEND = 8000
const P503 = 90_000

describe('planSend', () => {
  it('첫 전송은 바로 보낸다', () => {
    expect(planSend(1000, 0, 0, SEND, P503)).toEqual({ kind: 'go' })
  })

  it('쿨다운이 지났으면 바로 보낸다', () => {
    expect(planSend(20_000, 1000, 0, SEND, P503)).toEqual({ kind: 'go' })
  })

  it('연속 전송은 막지 않고 남은 시간만 기다린다', () => {
    // 막아서 되돌리면 그 user 말은 영영 답을 못 받는다 — 아래 회귀 테스트 참고
    expect(planSend(5000, 1000, 0, SEND, P503)).toEqual({ kind: 'wait', ms: 4000 })
    expect(planSend(8999, 1000, 0, SEND, P503)).toEqual({ kind: 'wait', ms: 1 })
  })

  it('503 직후에는 보내지 않고 남은 초를 알려준다', () => {
    expect(planSend(10_000, 1000, 5000, SEND, P503)).toEqual({ kind: 'blocked', waitSec: 85 })
  })

  it('503 쿨다운이 짧은 전송 쿨다운보다 우선한다', () => {
    expect(planSend(2000, 1000, 1000, SEND, P503).kind).toBe('blocked')
  })
})

describe('쿨다운이 대화를 오염시키지 않는다 (회귀)', () => {
  // 예전 버그: 쿨다운에 걸리면 user 말 + "(잠깐 — N초...)" 말풍선을 대화에 넣었다.
  // 그러면 그 user 말이 skippedUserMessages로 들어가 **영영 답을 못 받는다.**
  it('답 없이 남은 user 말은 다음 턴에서 건너뛰어진다 — 그래서 애초에 남기면 안 된다', () => {
    const t = 1_000_000
    const withCooldownBubble: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '카페 왔어', timestamp: t },
      { id: 's1', role: 'self', content: '오 좋다ㅋㅋ', timestamp: t + 1 },
      { id: 'u2', role: 'user', content: '어제 그거 결국 했어', timestamp: t + 2 },
      {
        id: 's2',
        role: 'self',
        content: '(잠깐 — 5초만 더 쉬었다 보내줘. 너무 빨리 연속으로 보내면 Google 쪽에서 막혀 ㅠ)',
        timestamp: t + 3,
      },
      { id: 'u3', role: 'user', content: '그래서 기분 좋아', timestamp: t + 4 },
    ]
    const plan = buildReplyPlan(withCooldownBubble)!
    expect(plan.skippedUserMessages.map((m) => m.id)).toEqual(['u2'])
    expect(plan.focusInstruction).toContain('건너뛸 것')

    // 지금 구조: 쿨다운은 아무것도 남기지 않고 기다렸다 보내므로 u2가 focus가 된다
    const waited = withCooldownBubble.filter((m) => m.id !== 's2' && m.id !== 'u3')
    const plan2 = buildReplyPlan(waited)!
    expect(plan2.focusMessageId).toBe('u2')
    expect(plan2.skippedUserMessages).toEqual([])
  })
})
