// 프록시는 클라이언트가 보낸 모델을 허용 목록으로 거른다.
// 앱에서 모델을 바꾸면 서버 목록도 같이 바꿔야 하는데, 서로 다른 언어(bun/deno)라
// 컴파일러가 안 잡아준다. 어긋나면:
//   - 채팅 모델이 어긋나면 → 프록시가 옛 모델을 계속 부른다
//   - 이미지 모델이 빠지면 → 미래 사진이 400으로 막힌다 (실제로 겪었다)
import { expect, test } from 'bun:test'
import { DEFAULT_GEMINI_MODEL } from '../src/lib/selfEngine'
import { GEMINI_IMAGE_MODELS } from '../src/lib/futureVisionEngine'

const serverSource = await Bun.file('supabase/functions/gemini/index.ts').text()

test('서버의 채팅 모델이 앱의 채팅 모델과 같다', () => {
  const match = serverSource.match(/const TEXT_MODEL = '([^']+)'/)
  expect(match?.[1]).toBe(DEFAULT_GEMINI_MODEL)
})

test('앱이 쓰는 이미지 모델이 전부 서버 허용 목록에 있다', () => {
  const block = serverSource.match(/const IMAGE_MODELS = \[([^\]]+)\]/)?.[1] ?? ''
  for (const model of GEMINI_IMAGE_MODELS) {
    expect(block).toContain(model)
  }
})

test('허용 목록 밖의 모델은 거부한다', () => {
  // 목록에 없으면 400 — 클라이언트가 비싼 모델로 바꿔 부르는 걸 막는다
  expect(serverSource).toContain('ALLOWED_MODELS.has(model)')
  expect(serverSource).toContain('model_not_allowed')
})

test('사진은 채팅과 다른 통에서 센다', () => {
  // 같은 통이면 사진 몇 장이 하루치 대화를 다 태운다
  expect(serverSource).toContain('AI_IMAGE_DAILY_LIMIT')
  expect(serverSource).toContain("p_kind: kind")
})
