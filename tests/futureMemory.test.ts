import { describe, expect, it } from 'bun:test'
import {
  buildFutureMemoryPrompt,
  dropPredictions,
  hasEnoughMaterial,
  parseFutureMemories,
} from '../src/lib/futureMemory'
import { emptyProfile } from '../src/types/self'
import type { SelfProfile } from '../src/types/self'

function profileWithFuture(): SelfProfile {
  const p = emptyProfile()
  p.name = '지웅'
  p.age = 27
  p.lifeContext = '개발 공부하면서 앱 만드는 중'
  p.future = {
    ...p.future,
    identityLine: '내 앱으로 사람들 하루를 바꾸는 사람',
    typicalDay: '아침에 운동하고 오전엔 코드, 오후엔 사람 만나기',
    adviceLine: '조급해하지 마',
  } as SelfProfile['future']
  return p
}

describe('hasEnoughMaterial', () => {
  it('온보딩이 비면 재료 부족 — 지어내기만 한다', () => {
    expect(hasEnoughMaterial(emptyProfile())).toBe(false)
  })

  it('미래 답이 여러 개면 재료가 있다', () => {
    expect(hasEnoughMaterial(profileWithFuture())).toBe(true)
  })
})

describe('buildFutureMemoryPrompt', () => {
  it('유저가 쓴 답이 프롬프트에 실린다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('내 앱으로 사람들 하루를 바꾸는 사람')
    expect(prompt).toContain('개발 공부하면서 앱 만드는 중')
  })

  it('세 가지 방어가 프롬프트에 있다 — 재료 밖 금지·예언 금지·흔들린 순간', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('밖으로 나가지 말 것')
    expect(prompt).toContain('예언')
    expect(prompt).toContain('흔들린 순간')
  })
})

describe('parseFutureMemories', () => {
  it('코드펜스로 감싸도 읽는다', () => {
    const raw = '```json\n["첫 기억", "둘째 기억"]\n```'
    expect(parseFutureMemories(raw)).toEqual(['첫 기억', '둘째 기억'])
  })

  it('앞뒤에 설명이 붙어도 배열만 뽑는다', () => {
    expect(parseFutureMemories('네, 여기 있습니다:\n["가", "나"]\n도움이 되었길!')).toEqual(['가', '나'])
  })

  it('읽을 수 없으면 빈 배열', () => {
    expect(parseFutureMemories('그냥 문장입니다')).toEqual([])
  })
})

describe('dropPredictions', () => {
  it('예언조는 버린다 — 미래의 나는 점쟁이가 아니다', () => {
    const kept = dropPredictions([
      '3년차 봄에 진짜 그만둘까 했는데 두 달만 더 해보자 하고 버텼다',
      '너도 곧 잘 풀리게 될 거야',
      '처음 내 돈으로 부모님 여행 보내드린 날 진짜 울컥하더라',
      '이 길로 가면 분명 성공할 것이다',
    ])
    expect(kept).toEqual([
      '3년차 봄에 진짜 그만둘까 했는데 두 달만 더 해보자 하고 버텼다',
      '처음 내 돈으로 부모님 여행 보내드린 날 진짜 울컥하더라',
    ])
  })

  it('회상은 남긴다', () => {
    expect(dropPredictions(['그때는 매일 새벽에 나가는 게 죽도록 싫었다'])).toHaveLength(1)
  })
})
