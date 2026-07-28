-- FutureMe 원조 알림 제품화: 할 일 리마인더 예약표 + 중복 발송 방지
create table if not exists public.futureme_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  fire_date date not null,
  fire_time text not null,
  kind text not null check (kind in ('start', 'end')),
  item_id text not null,
  label text not null,
  goal_title text not null default '',
  updated_at bigint not null,
  primary key (user_id, fire_date, item_id, kind)
);

alter table public.futureme_reminders enable row level security;

drop policy if exists "reminders own" on public.futureme_reminders;
create policy "reminders own" on public.futureme_reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists futureme_reminders_fire
  on public.futureme_reminders (fire_date, fire_time);

create table if not exists public.futureme_push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  fire_date date not null,
  item_id text not null,
  kind text not null,
  sent_at bigint not null,
  primary key (user_id, endpoint, fire_date, item_id, kind)
);

alter table public.futureme_push_sent enable row level security;

drop policy if exists "push sent own" on public.futureme_push_sent;
create policy "push sent own" on public.futureme_push_sent
  for select using (auth.uid() = user_id);
