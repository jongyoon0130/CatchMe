-- 크론(매분 푸시)이 실제로 도는지 앱에서 확인용
create table if not exists public.futureme_alarm_cron_heartbeat (
  id int primary key default 1 check (id = 1),
  last_run_at bigint not null,
  last_sent int not null default 0,
  last_hhmm text not null default ''
);

alter table public.futureme_alarm_cron_heartbeat enable row level security;

drop policy if exists "cron heartbeat read" on public.futureme_alarm_cron_heartbeat;
create policy "cron heartbeat read" on public.futureme_alarm_cron_heartbeat
  for select using (true);

-- dedup 테이블 없으면 푸시가 아예 안 가던 문제 방지
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
