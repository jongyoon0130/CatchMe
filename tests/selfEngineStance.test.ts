import { describe, expect, it } from 'bun:test'
import {
  EXPLICIT_ACTION_REQUEST_RE,
  analyzeMessage,
  enforceReplyLimits,
  isActionNudgeSentence,
  pickReplyStance,
} from '../src/lib/selfEngine'

describe('analyzeMessage — action need', () => {
  it('일반 고민/하소연에는 action을 넣지 않는다', () => {
    const cases = [
      '너무 오랜만에 돌아왔네. 여태껏 너무 귀찮다고 아무것도 안하고있었어',
      '요즘 스트레스 받아',
      '창업하고 싶은데 무서워',
    ]
    for (const msg of cases) {
      const a = analyzeMessage(msg)
      expect(a.needs).not.toContain('action')
    }
  })

  it('실행·방향을 직접 물을 때만 action을 넣는다', () => {
    const a = analyzeMessage('뭐부터 해야 할지 모르겠어')
    expect(a.needs).toContain('action')
    expect(EXPLICIT_ACTION_REQUEST_RE.test('뭐부터 해야 할지 모르겠어')).toBe(true)
  })

  it('쓴소리 요청 시 challenge를 넣는다', () => {
    const a = analyzeMessage('나 좀 쓴소리 해줘. 계속 미루고 있어.')
    expect(a.needs).toContain('challenge')
  })
})

describe('pickReplyStance', () => {
  it('기본 대화는 action_plan이 아니다', () => {
    const msg = '요즘 뭔가 고민인데'
    const a = analyzeMessage(msg)
    expect(pickReplyStance(a, msg, '담담하게')).not.toBe('action_plan')
  })

  it('실행을 직접 물으면 action_plan', () => {
    const msg = '뭐부터 해야 할지 모르겠어'
    const a = analyzeMessage(msg)
    expect(pickReplyStance(a, msg, '담담하게')).toBe('action_plan')
  })

  it('고민·결정은 perspective/curious/mirror 쪽', () => {
    const msg = '좋아하는 사람 있는데 가만히 있으면 후회할 것 같아'
    const a = analyzeMessage(msg)
    const stance = pickReplyStance(a, msg, '담담하게')
    expect(['perspective', 'curious', 'mirror']).toContain(stance)
  })
})

describe('enforceReplyLimits — 코칭 클리셰 필터', () => {
  it('user가 실행을 묻지 않았으면 "작은 거" 문장을 제거한다', () => {
    const user = '오랜만에 왔는데 너무 귀찮았어'
    const raw =
      '푹 쉬었다고 생각하자. 근데 계속 쉬면 불안함만 커지잖아. 그냥 지금 바로 할 수 있는 아주 작은 거 하나만 해볼래?'
    const out = enforceReplyLimits(raw, user)
    expect(out).not.toMatch(/작은/)
    expect(out).not.toMatch(/푹 쉬/)
    expect(out.length).toBe(0)
  })

  it('user가 실행을 물으면 행동 제안 문장은 남긴다', () => {
    const user = '뭐부터 해야 할지 모르겠어'
    const raw = '일단 포트폴리오 목차부터 잡아보는 게 낫겠다.'
    expect(enforceReplyLimits(raw, user)).toContain('포트폴리오')
  })

  it('고민 중 공유에는 "하나만 건드려" 코칭 클리셰를 제거한다', () => {
    const user = '앱 개발에 열중할 건데, 뭘 집중할지는 아직 고민 중이야.'
    const raw =
      '일단 지금 제일 찝찝하게 남아있는 부분 하나만 먼저 건드려보자. 그게 속은 제일 시원하더라고.'
    const out = enforceReplyLimits(raw, user)
    expect(out).toBe('')
    expect(isActionNudgeSentence('제일 찝찝한 부분 하나만 먼저 건드려보자.')).toBe(true)
  })
})
