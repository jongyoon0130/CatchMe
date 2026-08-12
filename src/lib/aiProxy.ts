// ---------------------------------------------------------------------------
// AI 프록시 — 구글을 직접 부르지 않고 우리 서버 함수를 거친다.
//
// 왜: 예전에는 유저가 aistudio에서 키를 발급받아 앱에 붙여넣어야 첫 대화가 됐다.
//     키를 앱에 내장하면 그 단계는 없어지지만, 빌드 결과물과 네트워크 요청에
//     키가 평문으로 드러난다. 서버가 대신 부르면 키가 기기에 오지 않는다.
//
// 이 파일은 "어디로 보낼지"만 안다. 프롬프트 구성은 selfEngine이 그대로 한다.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

/**
 * "키 대신 프록시를 쓴다"는 표식.
 *
 * 키를 읽는 곳이 8군데라 각각에 "프록시 쓸 수 있나" 검사를 넣으면 하나만
 * 빠져도 조용히 막힌다. 그래서 resolveEffectiveApiKey()가 키 자리에 이 값을
 * 돌려주고, **실제로 URL을 만드는 두 곳**(selfEngine, planSuggestionEngine)에서만
 * 걸러낸다. 그 두 곳은 이 값을 보면 구글이 아니라 프록시로 보낸다.
 */
export const AI_PROXY_KEY = '__catchme_ai_proxy__'

/** 프록시를 쓸 수 있는 상태인가 — Supabase가 설정돼 있어야 한다 */
export function isAiProxyConfigured(): boolean {
  return supabase != null && aiProxyUrl() != null
}

export function aiProxyUrl(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return null
  // 절대 주소여야 한다 — iOS 앱은 폰 안의 파일로 실행돼서 상대 경로가 우리 서버를
  // 가리키지 않는다. VITE_SUPABASE_URL이 이미 절대 주소다.
  return `${base.replace(/\/+$/, '')}/functions/v1/gemini`
}

/**
 * 보낼 요청의 모양. 토큰을 받아서 만드는 순수 함수로 떼어놨다 —
 * 이 부분이 테스트에서 확인해야 할 전부인데, 여기 로그인 조회가 섞여 있으면
 * Supabase를 흉내내야 하고 그 흉내가 다른 테스트로 새어나간다(실제로 그랬다).
 */
export function buildProxyRequest(
  token: string,
  body: object,
  signal?: AbortSignal,
): { url: string; init: RequestInit } {
  const url = aiProxyUrl()
  if (!url) throw new Error('ai_proxy_not_configured')
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body }),
      signal,
    },
  }
}

/**
 * 프록시로 generateContent 요청. 구글의 응답을 상태 코드까지 그대로 돌려주므로
 * 호출하는 쪽은 구글을 직접 부른 것과 같은 방식으로 처리하면 된다.
 */
export async function fetchGeminiViaProxy(body: object, signal?: AbortSignal): Promise<Response> {
  if (!supabase) throw new Error('ai_proxy_not_configured')

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  // 로그인해야 부를 수 있다. 서버도 막지만, 여기서 걸러 헛요청을 줄인다.
  if (!token) throw new Error('ai_proxy_requires_login')

  const { url, init } = buildProxyRequest(token, body, signal)
  return fetch(url, init)
}
