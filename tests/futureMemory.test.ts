import { describe, expect, it } from 'bun:test'
import {
  buildFutureMemoryPrompt,
  dropPredictions,
  hasEnoughMaterial,
  parseFutureMemories,
} from '../src/lib/futureMemory'
import { emptyProfile, normalizeFutureSelf } from '../src/types/self'
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

  it('세 가지 방어가 프롬프트에 있다 — 지어내기 금지·예언 금지·우울하게 끝내기 금지', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('사람·사건·장소·직업은 만들지 말 것')
    expect(prompt).toContain('예언')
    expect(prompt).toContain('힘든 대목에서 끝내지 말 것')
  })

  // 실측(2026-08-11, 지웅님 백업): 5개 중 지어낸 건 '밤새'와 '뒤처지는'뿐이었고
  // 등장인물·사건·장소는 전부 온보딩 답에 있었다. 그 둘이 있어야 회상처럼 읽힌다.
  it('지어내기 금지가 사실에만 걸린다 — 시간·정도·감정은 열어둔다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('시간·정도·감정은 채워도 된다')
  })

  /**
   * 처음엔 "흔들린 순간을 잘 풀린 순간보다 적지 않게"라고 시켰다. 실제로 돌려보니
   * 5개 중 4개가 **극복 없이 힘든 대목에서 끝났다** — 미래의 나가 우울한 사람이 됐다.
   * 지웅님이 잡아냈다: 이 앱은 흔들림이 아니라 **극복**에 초점을 둬야 한다.
   * 그래서 규칙을 "힘든 장면 금지"도 "절반 넣기"도 아닌 **"넘어선 이야기만"**으로 바꿨다.
   */
  it('힘든 대목에서 끝내지 말고 어떻게 됐는지까지 쓰라고 시킨다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('힘든 대목에서 끝내지 말 것')
    expect(prompt).not.toContain('적지 않게')
    expect(prompt).not.toContain('최소 2개')
  })

  /**
   * 위를 고쳤더니 이번엔 5개가 **전부** "막혔지만 결국 됐어" 한 모양이 됐다.
   * 지웅님이 잡아냈다 — 같은 모양 다섯 번이면 기억이 아니라 공식이다.
   * (few-shot에서 "나도 그때~"가 83%까지 갔던 것과 같은 종류의 실패다.)
   * 그래서 "전부 극복 서사"를 요구하지 않고 **결을 골고루** 요구한다.
   */
  it('한 모양으로 몰리지 말라고 시킨다 — 결 목록을 준다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('서로 다른 결')
    expect(prompt).not.toContain('모든 기억은 넘어선 이야기')
    for (const shape of ['넘어선 것', '결과를 아는 것', '시간이 지워준 것', '그냥 좋았던 장면', '예상 못 한 것']) {
      expect(prompt).toContain(shape)
    }
  })

  it('그렇다고 다 쉬웠던 척도 막는다 — 그건 잘난 척이 된다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('다 쉬웠던 것처럼 쓰지도 말 것')
  })

  // 규칙4를 고친 뒤 실측에서 5개 중 2개가 "네가 정말 대견해" 식 2인칭 칭찬으로 흘렀다.
  // 기억은 "나도 그때 ~하더라"로 꺼낼 재료지 user 평가가 아니다 — 평가·아는 척 금지선과 같은 방향.
  it('user를 평가하는 2인칭 칭찬을 막는다', () => {
    const prompt = buildFutureMemoryPrompt(profileWithFuture())
    expect(prompt).toContain('user를 평가하지 말 것')
    expect(prompt).toContain('1인칭')
  })
})

// 기억은 프로필 안에 산다. 불러오기(normalizeFutureSelf)가 모르는 필드를 떨어뜨리면
// 저장은 되는데 다음에 열 때 사라진다 — 조용히 없어지는 종류라 여기서 잠근다.
describe('기억이 저장·복원을 견딘다', () => {
  it('새 프로필의 기억은 빈 배열이다', () => {
    expect(emptyProfile().future.memories).toEqual([])
  })

  it('불러오기가 기억을 지우지 않는다', () => {
    const saved = { ...profileWithFuture().future, memories: ['그 여름날 밤새 고민만 했다'] }
    const round = normalizeFutureSelf(JSON.parse(JSON.stringify(saved)))
    expect(round.memories).toEqual(['그 여름날 밤새 고민만 했다'])
  })

  it('기억이 없던 옛 프로필도 깨지지 않는다', () => {
    const old = { ...profileWithFuture().future } as Record<string, unknown>
    delete old.memories
    expect(normalizeFutureSelf(old).memories).toEqual([])
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
