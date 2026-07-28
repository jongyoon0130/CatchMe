-- Future Me Studio — 알람 푸시 한방 설정
-- project: dwawzmxungglfsluurjv
-- SQL Editor에 붙여넣고 Run (1번 실행)

-- ① 테이블
create table if not exists public.futureme_alarm_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alarms jsonb not null default '[]'::jsonb,
  dismiss_phrases jsonb not null default '[]'::jsonb,
  alarm_settings jsonb not null default '{"enabled": true}'::jsonb,
  timezone text not null default 'Asia/Seoul',
  updated_at bigint not null
);

alter table public.futureme_alarm_data enable row level security;
drop policy if exists "alarm data own" on public.futureme_alarm_data;
create policy "alarm data own" on public.futureme_alarm_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.futureme_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  timezone text not null default 'Asia/Seoul',
  enabled boolean not null default true,
  updated_at bigint not null,
  unique (user_id, endpoint)
);

alter table public.futureme_push_subscriptions enable row level security;
drop policy if exists "push subs own" on public.futureme_push_subscriptions;
create policy "push subs own" on public.futureme_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.futureme_alarm_push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  alarm_id text not null,
  date_key text not null,
  alarm_time text not null,
  sent_at bigint not null,
  primary key (user_id, alarm_id, date_key, alarm_time)
);

alter table public.futureme_alarm_push_sent enable row level security;
drop policy if exists "alarm push sent own" on public.futureme_alarm_push_sent;
create policy "alarm push sent own" on public.futureme_alarm_push_sent
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists futureme_push_subscriptions_user on public.futureme_push_subscriptions (user_id, enabled);

-- ② cron (Extension pg_cron, pg_net 을 Dashboard → Database → Extensions 에서 켠 뒤 실행)
--    Edge Function alarm-push 배포 + Secrets 설정 후 실행

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'futureme-alarm-push') THEN
    PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'futureme-alarm-push' LIMIT 1));
  END IF;
END $$;

select cron.schedule(
  'futureme-alarm-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://dwawzmxungglfsluurjv.supabase.co/functions/v1/alarm-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alarm-cron-secret', 'a71522c2bd42fcc59733d69f7dc2010ca51b609ef905eb88'
    ),
    body := '{}'::jsonb
  );
  $$
);
