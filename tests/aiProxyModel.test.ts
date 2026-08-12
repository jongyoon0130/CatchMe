// 프록시는 클라이언트가 보낸 모델 이름을 믿지 않고 서버가 고정한다.
// 그래서 앱의 모델을 바꾸면 서버 함수도 같이 바꿔야 하는데, 서로 다른 언어(bun/deno)라
// 컴파일러가 안 잡아준다. 어긋나면 프록시만 옛 모델을 계속 부른다.
import { expect, test } from 'bun:test'
import { DEFAULT_GEMINI_MODEL } from '../src/lib/selfEngine'

test('서버 프록시가 고정한 모델이 앱의 모델과 같다', async () => {
  const fn = await Bun.file('supabase/functions/gemini/index.ts').text()
  const match = fn.match(/const MODEL = '([^']+)'/)
  expect(match?.[1]).toBe(DEFAULT_GEMINI_MODEL)
})
