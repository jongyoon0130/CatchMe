import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type UserAlarm = {
  id: string
  time: string
  label: string
  enabled: boolean
  repeatDays: number[]
}

type DismissPhrase = {
  alarmId: string
  dateKey: string
  phrase: string
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-alarm-cron-secret',
}

const DEFAULT_ORIGIN = 'https://future-me-studio.vercel.app'

function localParts(timezone: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`
  const hhmm = `${String(Number(parts.hour) % 24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = dowMap[parts.weekday?.slice(0, 3) ?? ''] ?? now.getUTCDay()
  return { dateKey, hhmm, dow }
}

function alarmActiveToday(alarm: UserAlarm, dow: number): boolean {
  if (!alarm.enabled) return false
  const days = alarm.repeatDays?.length ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6]
  return days.includes(dow)
}

function findPhrase(_phrases: DismissPhrase[], _alarmId: string, _dateKey: string): string | null {
  return '안녕'
}

function normTime(value: string): string {
  const [h, m] = value.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function appOrigin(body: { origin?: string } | null): string {
  const fromBody = body?.origin?.trim()
  if (fromBody && /^https:\/\//.test(fromBody)) return fromBody.replace(/\/$/, '')
  const fromEnv = Deno.env.get('APP_ORIGIN')?.trim()
  if (fromEnv && /^https:\/\//.test(fromEnv)) return fromEnv.replace(/\/$/, '')
  return DEFAULT_ORIGIN
}

function buildAlarmUrl(origin: string, params: URLSearchParams): string {
  return `${origin}/index.html?${params.toString()}`
}

async function resolveTestUserId(
  req: Request,
  supabaseUrl: string,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!anon) return null
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  return user?.id ?? null
}

async function sendPushToSubs(
  subs: { subscription: webpush.PushSubscription; user_id?: string; userId?: string; endpoint?: string }[],
  payload: string,
  admin: ReturnType<typeof createClient>,
): Promise<number> {
  let sent = 0
  for (const subRow of subs) {
    const userId = subRow.userId ?? subRow.user_id
    try {
      const pushSub =
        subRow.subscription && typeof subRow.subscription === 'object' && 'endpoint' in subRow.subscription
          ? (subRow.subscription as webpush.PushSubscription)
          : ({
              endpoint: subRow.endpoint,
              keys: (subRow.subscription as { keys?: webpush.PushSubscription['keys'] })?.keys,
            } as webpush.PushSubscription)
      await webpush.sendNotification(pushSub, payload)
      sent += 1
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if ((status === 404 || status === 410) && userId && subRow.endpoint) {
        await admin
          .from('futureme_push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subRow.endpoint)
      }
      console.error('push failed', e)
    }
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('ALARM_CRON_SECRET')
  const got = req.headers.get('x-alarm-cron-secret')
  const isCron = !!secret && got === secret

  let body: { test?: boolean; origin?: string } | null = null
  if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      body = null
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:alarm@futureme.app'

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ ok: false, reason: 'missing_env' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const testUserId = !isCron && body?.test ? await resolveTestUserId(req, supabaseUrl) : null
  if (!isCron && !testUserId) {
    return new Response('forbidden', { status: 403, headers: cors })
  }

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate)
  const admin = createClient(supabaseUrl, serviceKey)
  const origin = appOrigin(body)

  if (testUserId) {
    const { data: subs, error: subErr } = await admin
      .from('futureme_push_subscriptions')
      .select('user_id, endpoint, subscription')
      .eq('user_id', testUserId)
      .eq('enabled', true)

    if (subErr) {
      return new Response(JSON.stringify({ ok: false, error: subErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date()
    const dateKey = now.toISOString().slice(0, 10)
    const params = new URLSearchParams({
      alarm: '1',
      alarmId: 'test',
      dateKey,
      time: '00:00',
      label: '잠금 화면 테스트',
      phrase: '안녕',
    })
    const url = buildAlarmUrl(origin, params)
    const payload = JSON.stringify({
      title: 'Catch Me — 잠금 알람 테스트',
      body: '탭하면 따라치기 화면이 열려요',
      tag: `futureme-test-${Date.now()}`,
      url,
      alarm: { alarmId: 'test', dateKey, time: '00:00', label: '테스트', phrase: params.get('phrase') },
    })

    const sent = await sendPushToSubs(subs ?? [], payload, admin)
    return new Response(JSON.stringify({ ok: true, sent, mode: 'test' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { data: alarmRows, error: alarmErr } = await admin
    .from('futureme_alarm_data')
    .select('user_id, alarms, dismiss_phrases, alarm_settings, timezone')
  if (alarmErr) {
    return new Response(JSON.stringify({ ok: false, error: alarmErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  const now = new Date()
  const { data: allSubs } = await admin
    .from('futureme_push_subscriptions')
    .select('endpoint')
    .eq('enabled', true)

  let stats = {
    users: alarmRows?.length ?? 0,
    usersWithEnabledAlarms: 0,
    pushSubs: allSubs?.length ?? 0,
    dueThisMinute: 0,
    hhmm: '',
  }

  for (const row of alarmRows ?? []) {
    if (row.alarm_settings?.enabled === false) continue
    const tz = row.timezone || 'Asia/Seoul'
    const { dateKey, hhmm, dow } = localParts(tz, now)
    if (!stats.hhmm) stats.hhmm = hhmm
    const alarms = (row.alarms ?? []) as UserAlarm[]
    const phrases = (row.dismiss_phrases ?? []) as DismissPhrase[]
    const enabledAlarms = alarms.filter((a) => a.enabled !== false)
    if (enabledAlarms.length) stats.usersWithEnabledAlarms += 1
    const due = enabledAlarms.filter((a) => alarmActiveToday(a, dow) && normTime(a.time) === hhmm)
    stats.dueThisMinute += due.length
    if (!due.length) continue

    const { data: subs } = await admin
      .from('futureme_push_subscriptions')
      .select('user_id, endpoint, subscription')
      .eq('user_id', row.user_id)
      .eq('enabled', true)
    if (!subs?.length) continue

    for (const alarm of due) {
      const dedup = { user_id: row.user_id, alarm_id: alarm.id, date_key: dateKey, alarm_time: alarm.time }
      const { error: insErr } = await admin.from('futureme_alarm_push_sent').insert({
        ...dedup,
        sent_at: Date.now(),
      })
      if (insErr?.code === '23505') continue
      if (insErr && insErr.code !== '42P01') {
        console.error('dedup insert failed', insErr)
      }

      const phrase = findPhrase(phrases, alarm.id, dateKey)
      const params = new URLSearchParams({
        alarm: '1',
        alarmId: alarm.id,
        dateKey,
        time: alarm.time,
        label: alarm.label || '알람',
      })
      if (phrase) params.set('phrase', phrase)
      const url = buildAlarmUrl(origin, params)
      const payload = JSON.stringify({
        title: alarm.label || '알람',
        body: phrase ? '다짐을 따라 쳐야 꺼져요 — Catch Me' : '알람 — Catch Me',
        tag: `clock:${dateKey}:${alarm.id}:${alarm.time}`,
        url,
        alarm: { alarmId: alarm.id, dateKey, time: alarm.time, label: alarm.label, phrase },
      })

      sent += await sendPushToSubs(subs, payload, admin)
    }
  }

  if (!stats.hhmm) stats.hhmm = localParts('Asia/Seoul', now).hhmm

  try {
    await admin.from('futureme_alarm_cron_heartbeat').upsert({
      id: 1,
      last_run_at: Date.now(),
      last_sent: sent,
      last_hhmm: stats.hhmm,
    })
  } catch {
    /* heartbeat 실패는 발송 자체를 막지 않는다 */
  }

  return new Response(JSON.stringify({ ok: true, sent, mode: 'cron', stats }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
