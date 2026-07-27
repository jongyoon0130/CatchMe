import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alarm-cron-secret',
}

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
  const hhmm = `${parts.hour}:${parts.minute}`
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow = dowMap[parts.weekday?.slice(0, 3) ?? ''] ?? now.getUTCDay()
  return { dateKey, hhmm, dow }
}

function alarmActiveToday(alarm: UserAlarm, dow: number): boolean {
  if (!alarm.enabled) return false
  const days = alarm.repeatDays?.length ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6]
  return days.includes(dow)
}

function findPhrase(phrases: DismissPhrase[], alarmId: string, dateKey: string): string | null {
  const hit = phrases.find((p) => p.alarmId === alarmId && p.dateKey === dateKey && p.phrase?.trim())
  return hit?.phrase?.trim() ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('ALARM_CRON_SECRET')
  if (secret) {
    const got = req.headers.get('x-alarm-cron-secret')
    if (got !== secret) return new Response('forbidden', { status: 403, headers: cors })
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

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate)
  const admin = createClient(supabaseUrl, serviceKey)

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

  for (const row of alarmRows ?? []) {
    if (row.alarm_settings?.enabled === false) continue
    const tz = row.timezone || 'Asia/Seoul'
    const { dateKey, hhmm, dow } = localParts(tz, now)
    const alarms = (row.alarms ?? []) as UserAlarm[]
    const phrases = (row.dismiss_phrases ?? []) as DismissPhrase[]
    const due = alarms.filter((a) => alarmActiveToday(a, dow) && a.time === hhmm)
    if (!due.length) continue

    const { data: subs } = await admin
      .from('futureme_push_subscriptions')
      .select('subscription')
      .eq('user_id', row.user_id)
      .eq('enabled', true)
    if (!subs?.length) continue

    for (const alarm of due) {
      const dedup = { user_id: row.user_id, alarm_id: alarm.id, date_key: dateKey, alarm_time: alarm.time }
      const { error: insErr } = await admin.from('futureme_alarm_push_sent').insert({
        ...dedup,
        sent_at: Date.now(),
      })
      if (insErr) continue

      const phrase = findPhrase(phrases, alarm.id, dateKey)
      const params = new URLSearchParams({
        alarm: '1',
        alarmId: alarm.id,
        dateKey,
        time: alarm.time,
        label: alarm.label || '알람',
      })
      const url = `/index.html?${params.toString()}`
      const payload = JSON.stringify({
        title: alarm.label || '알람',
        body: phrase ? '다짐을 따라 쳐야 꺼져요 — Future Me' : '알람 — Future Me',
        tag: `clock:${dateKey}:${alarm.id}:${alarm.time}`,
        url,
        alarm: { alarmId: alarm.id, dateKey, time: alarm.time, label: alarm.label },
      })

      for (const subRow of subs) {
        try {
          await webpush.sendNotification(subRow.subscription as webpush.PushSubscription, payload)
          sent += 1
        } catch (e) {
          console.error('push failed', e)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
