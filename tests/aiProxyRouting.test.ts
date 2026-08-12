// 프록시 표식(AI_PROXY_KEY)이 구글 요청 주소에 붙어서는 안 된다.
// 붙으면 ?key=__catchme_ai_proxy__ 로 나가서 400이 되고, 원인을 찾기 어렵다.
// URL을 만드는 곳은 두 군데뿐이라 그 두 파일이 표식을 걸러내는지 확인한다.
import { expect, test } from 'bun:test'
import { AI_PROXY_KEY } from '../src/lib/aiProxy'
import { rateLimitUserMessage } from '../src/lib/selfEngine'

test('URL을 만드는 두 곳이 프록시 표식을 걸러낸다', async () => {
  for (const f of ['src/lib/selfEngine.ts', 'src/lib/planSuggestionEngine.ts']) {
    const text = await Bun.file(f).text()
    // generativelanguage 주소를 만드는 파일이면, AI_PROXY_KEY 분기가 반드시 있어야 한다
    if (text.includes('generativelanguage.googleapis.com')) {
      expect(text).toContain('AI_PROXY_KEY')
    }
  }
})

test('표식이 실제 키로 오인될 만한 모양이 아니다', () => {
  expect(AI_PROXY_KEY.startsWith('AIza')).toBe(false)
  expect(AI_PROXY_KEY).toContain('proxy')
})

test('우리 서버가 건 하루 한도는 구글 한도와 다른 안내를 준다', () => {
  const proxy = rateLimitUserMessage('proxy_daily')
  const google = rateLimitUserMessage('daily')
  expect(proxy).not.toBe(google)
  // 모델을 바꿔도 안 풀리는 한도라 Flash-Lite 안내를 하면 안 된다
  expect(proxy).not.toContain('Flash-Lite')
})
