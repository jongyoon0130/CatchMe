// ---------------------------------------------------------------------------
// Gemini 프록시 — 유저 대신 서버가 구글을 부른다.
//
// 왜 서버가 하나:
//   지금까지는 유저가 aistudio에서 직접 키를 발급받아 앱에 붙여넣어야 첫 대화가 됐다.
//   그 키는 유저 기기에 남고, 예전에는 우리 DB에도 평문으로 올라갔다.
//   여기로 옮기면 키는 **이 함수의 환경변수에만** 존재한다.
//   유저 폰에는 한 번도 도착하지 않고, 우리도 유저 키를 가질 일이 없다.
//
// 누가 부를 수 있나:
//   verify_jwt 기본값 — 로그인한 사람만. 게이트웨이가 먼저 막고,
//   여기서 한 번 더 토큰으로 user.id 를 확인한다.
//
// 한도:
//   consume_ai_quota()가 "오늘 몇 번째인지"를 한 문장으로 세고 넘으면 429를 준다.
//   이게 없으면 계정 하나로 우리 하루 한도를 통째로 태울 수 있다.
//
// 모델은 클라이언트가 못 고른다:
//   앱이 쓰는 모델은 하나뿐(gemini-3-flash-preview)이라 서버가 고정한다.
//   클라이언트가 보낸 모델 이름을 그대로 믿으면 비싼 모델로 바꿔 부를 수 있다.
// ---------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** 앱이 쓰는 유일한 모델 (src/lib/selfEngine.ts 의 DEFAULT_GEMINI_MODEL 과 같아야 한다) */
const MODEL = 'gemini-3-flash-preview'

/**
 * 한 사람이 하루에 부를 수 있는 횟수.
 * 주의: 채팅 한 턴이 요청 한 건이 아니다. 답변 외에 대화 요약·인사이트 추출이
 * 가끔 따로 나가서, "하루 30턴"은 요청으로는 50건쯤 된다.
 */
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '50')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !serviceKey || !geminiKey) {
    console.error('[gemini] 환경변수 없음 (SUPABASE_URL / SERVICE_ROLE / GEMINI_API_KEY)')
    return json({ error: 'server_env_missing' }, 500)
  }

  // --- 부른 사람이 누구인지 ---
  const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '').trim()
  if (!token) return json({ error: 'not_authenticated' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_authenticated' }, 401)

  // --- 오늘 한도 ---
  const { data: quota, error: quotaError } = await admin
    .rpc('consume_ai_quota', { p_user: user.id, p_limit: DAILY_LIMIT })
    .single<{ allowed: boolean; used: number }>()

  if (quotaError) {
    // 한도를 못 세면 통과시키지 않는다 — 세지 못하는 상태가 곧 무제한이 된다.
    console.error('[gemini] 사용량 확인 실패', quotaError.message)
    return json({ error: 'quota_check_failed' }, 500)
  }
  if (!quota?.allowed) {
    return json(
      {
        error: {
          status: 'PROXY_DAILY_LIMIT',
          message: '오늘 대화 한도를 다 썼어요. 내일 다시 이어가요.',
          used: quota?.used ?? DAILY_LIMIT,
          limit: DAILY_LIMIT,
        },
      },
      429,
    )
  }

  // --- 구글 호출 ---
  // 앱이 만든 요청 본문을 그대로 넘긴다. 프롬프트 구성은 여전히 앱 쪽 코드가 한다.
  let body: unknown
  try {
    const payload = await req.json()
    body = payload?.body
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400)

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
    `?key=${encodeURIComponent(geminiKey)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error('[gemini] 구글 호출 실패', e instanceof Error ? e.message : e)
    return json({ error: 'upstream_unreachable' }, 502)
  }

  // 구글의 응답을 상태 코드까지 그대로 돌려준다.
  // 앱이 이미 429(한도)·503(과부하) 같은 코드를 보고 안내 문구를 고르고 있어서,
  // 여기서 모양을 바꾸면 그 처리가 전부 어긋난다.
  const raw = await res.text()
  return new Response(raw, {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
