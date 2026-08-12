// 프록시로 나가는 요청이 어떤 모양인지 확인한다.
// 특히 (1) 우리 서버 절대 주소로 가는지 (2) 로그인 토큰을 싣는지
// (3) 요청에 Gemini 키가 절대 안 들어가는지.
//
// Supabase를 흉내내지 않는다 — mock.module 은 이 파일 밖 테스트에도 적용돼서
// 다른 파일을 깨뜨린다(실제로 겪었다). 그래서 순수 함수만 확인한다.
import { beforeEach, expect, test } from 'bun:test'
import { aiProxyUrl, buildProxyRequest } from '../src/lib/aiProxy'

const SUPABASE_URL = 'https://example-project.supabase.co'
const TOKEN = 'test-access-token'

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = SUPABASE_URL
})

test('우리 서버의 절대 주소로 보낸다', () => {
  // 절대 주소여야 한다 — iOS 앱은 폰 안의 파일로 실행돼 상대 경로가 우리 서버를 못 찾는다
  expect(aiProxyUrl()).toBe(`${SUPABASE_URL}/functions/v1/gemini`)
  expect(aiProxyUrl()?.startsWith('https://')).toBe(true)
})

test('주소 끝에 슬래시가 있어도 이중 슬래시가 되지 않는다', () => {
  process.env.VITE_SUPABASE_URL = `${SUPABASE_URL}/`
  expect(aiProxyUrl()).toBe(`${SUPABASE_URL}/functions/v1/gemini`)
})

test('로그인 토큰을 싣는다', () => {
  const { init } = buildProxyRequest(TOKEN, { contents: [] })
  const headers = init.headers as Record<string, string>
  expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
})

test('요청 어디에도 Gemini 키가 없다', () => {
  const { url, init } = buildProxyRequest(TOKEN, { contents: [] })
  const whole = url + JSON.stringify(init)
  expect(whole).not.toContain('key=')
  expect(whole).not.toContain('AIza')
  expect(whole).not.toContain('generativelanguage')
})

test('앱이 만든 요청 본문을 그대로 감싸서 보낸다', () => {
  const body = { contents: [{ role: 'user', parts: [{ text: '테스트' }] }] }
  const { init } = buildProxyRequest(TOKEN, body)
  expect(JSON.parse(String(init.body))).toEqual({ body })
})
