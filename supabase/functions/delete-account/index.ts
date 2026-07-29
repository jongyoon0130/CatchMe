// ---------------------------------------------------------------------------
// 계정 삭제 — 사용자가 "계정 삭제"를 누르면 그 사람의 로그인 계정과 모든 데이터를 지운다.
//
// 왜 서버(Edge Function)가 하나:
//   자기 로그인 계정(auth.users)을 지우는 건 브라우저가 못 한다(관리자 권한 필요).
//   그래서 service_role 키를 가진 서버만 할 수 있다.
//
// 데이터는 어떻게 다 지워지나:
//   모든 사용자 테이블(futureme_profiles/chats/goal_data/settings/reminders/
//   alarm_data/push_subscriptions 등)이 user_id를 auth.users(id)에
//   **on delete cascade**로 걸어놨다. 그래서 계정 하나만 지우면 DB가 관련 행을
//   전부 자동으로 지운다. 여기서는 테이블을 일일이 지울 필요가 없다.
//
// 권한: verify_jwt 기본값 — 로그인한 사람만 부를 수 있고, "자기 자신"만 지운다
//   (JWT에서 얻은 user.id를 지우므로 남의 계정은 절대 못 지운다).
// ---------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** 브라우저에 노출돼도 되는 공개 키 (SUPABASE_ANON_KEY는 deprecated라 새 이름도 함께 본다) */
function readPublicKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (legacy) return legacy
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')?.trim()
  if (!raw) return null
  if (raw.startsWith('sb_publishable_')) return raw
  try {
    const parsed = JSON.parse(raw)
    const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed, ...Object.values(parsed)]
    for (const item of candidates) {
      if (typeof item === 'string' && item.startsWith('sb_publishable_')) return item
      if (item && typeof item === 'object') {
        for (const v of Object.values(item as Record<string, unknown>)) {
          if (typeof v === 'string' && v.startsWith('sb_publishable_')) return v
        }
      }
    }
  } catch {
    /* JSON이 아니면 무시 */
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const publicKey = readPublicKey()
  if (!supabaseUrl || !serviceKey || !publicKey) {
    console.error('[delete-account] 필요한 환경변수(SUPABASE_URL/SERVICE_ROLE/공개키)가 없다')
    return json({ error: 'supabase_env_missing' }, 500)
  }

  // --- 부른 사람이 누구인지 (JWT로 검증) — 자기 자신만 지울 수 있다 ---
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'not_authenticated' }, 401)

  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_authenticated' }, 401)

  // --- 관리자 권한으로 그 계정을 삭제 (cascade로 모든 데이터가 함께 지워진다) ---
  const admin = createClient(supabaseUrl, serviceKey)
  const { error: delError } = await admin.auth.admin.deleteUser(user.id)
  if (delError) {
    console.error('[delete-account] 계정 삭제 실패', delError.message)
    return json({ error: 'delete_failed', detail: delError.message }, 500)
  }

  return json({ ok: true })
})
