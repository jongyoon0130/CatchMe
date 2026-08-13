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
  // 브라우저가 본 요청 전에 "보내도 되냐"를 매번 묻는다(측정값 235ms).
  // 하루 동안 안 물어도 된다고 답해 그 왕복을 없앤다.
  'Access-Control-Max-Age': '86400',
}

/** 채팅·요약·계획 (src/lib/selfEngine.ts 의 DEFAULT_GEMINI_MODEL 과 같아야 한다) */
const TEXT_MODEL = 'gemini-3-flash-preview'

/** 미래 사진 (src/lib/futureVisionEngine.ts 의 GEMINI_IMAGE_MODELS 와 같아야 한다) */
const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image']

/**
 * 부를 수 있는 모델은 이 목록뿐이다.
 * 클라이언트가 보낸 이름을 그대로 믿으면 훨씬 비싼 모델로 바꿔 부를 수 있다.
 * 그렇다고 하나로 고정하면 사진이 글자 모델로 가서 그림이 안 나온다(실제로 그랬다).
 */
const ALLOWED_MODELS = new Set([TEXT_MODEL, ...IMAGE_MODELS])

/**
 * 한 사람이 하루에 부를 수 있는 횟수.
 * 주의: 채팅 한 턴이 요청 한 건이 아니다. 답변 외에 대화 요약·인사이트 추출이
 * 가끔 따로 나가서, "하루 30턴"은 요청으로는 50건쯤 된다.
 */
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '200')

/**
 * 미래 사진은 따로, 훨씬 적게 센다.
 * 글자보다 몇십 배 비싸서, 채팅과 같은 통에 두면 사진 몇 장이 하루치를 다 태운다.
 */
const IMAGE_DAILY_LIMIT = Number(Deno.env.get('AI_IMAGE_DAILY_LIMIT') ?? '1')

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

  // --- 무엇을 부르려는지 ---
  // 한도를 세기 전에 본문을 읽는다. 잘못된 요청으로 한도가 깎이면 안 된다.
  let body: unknown
  let model = TEXT_MODEL
  try {
    const payload = await req.json()
    body = payload?.body
    if (typeof payload?.model === 'string' && payload.model) model = payload.model
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400)
  if (!ALLOWED_MODELS.has(model)) {
    console.error('[gemini] 허용되지 않은 모델', model)
    return json({ error: 'model_not_allowed', model }, 400)
  }

  // --- 오늘 한도 ---
  // 사진은 글자보다 몇십 배 비싸서 따로 센다. 같은 통에 두면 사진 몇 장이 하루치를 태운다.
  const isImage = IMAGE_MODELS.includes(model)
  const kind = isImage ? 'image' : 'chat'
  const limit = isImage ? IMAGE_DAILY_LIMIT : DAILY_LIMIT

  const { data: quota, error: quotaError } = await admin
    .rpc('consume_ai_quota', { p_user: user.id, p_limit: limit, p_kind: kind })
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
          status: isImage ? 'PROXY_IMAGE_DAILY_LIMIT' : 'PROXY_DAILY_LIMIT',
          message: isImage
            ? '미래 사진은 하루에 한 번만 만들 수 있어요. 내일 다시 만들어봐요.'
            : '오늘 대화 한도를 다 썼어요. 내일 다시 이어가요.',
          used: quota?.used ?? limit,
          limit,
        },
      },
      429,
    )
  }

  // model은 위에서 허용 목록으로 검사했다 — 임의의 값이 주소에 들어가지 않는다
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
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
