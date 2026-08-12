-- Catch Me cloud sync schema (Supabase SQL Editor에서 실행)

create table if not exists public.futureme_profiles (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_data jsonb not null,
  preview text not null default '',
  updated_at bigint not null,
  primary key (user_id, id)
);

create table if not exists public.futureme_chats (
  profile_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at bigint not null,
  primary key (user_id, profile_id)
);

create table if not exists public.futureme_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_model text,
  gemini_api_key text,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.futureme_profiles enable row level security;
alter table public.futureme_chats enable row level security;
alter table public.futureme_settings enable row level security;

create policy "profiles own" on public.futureme_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chats own" on public.futureme_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings own" on public.futureme_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 미래 카메라 사진 (프로필별 · JSON data URL)
create table if not exists public.futureme_profile_photos (
  profile_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  photos jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  primary key (user_id, profile_id)
);

alter table public.futureme_profile_photos enable row level security;

create policy "profile photos own" on public.futureme_profile_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists futureme_profile_photos_user on public.futureme_profile_photos (user_id, updated_at desc);

create index if not exists futureme_profiles_user_updated on public.futureme_profiles (user_id, updated_at desc);

-- 홈 목표·할 일 (goal-plans, misc todos, 반복 일정)
create table if not exists public.futureme_goal_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  owner_id text not null,
  plans jsonb not null default '[]'::jsonb,
  misc_todos jsonb not null default '[]'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  updated_at bigint not null
);

-- 이미 테이블을 만든 프로젝트용 (반복 일정 추가분)
alter table public.futureme_goal_data
  add column if not exists routines jsonb not null default '[]'::jsonb;

alter table public.futureme_goal_data enable row level security;

create policy "goal data own" on public.futureme_goal_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 알람 · 다짐 문장 (클라우드 동기화 + 서버 스케줄러용)
create table if not exists public.futureme_alarm_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alarms jsonb not null default '[]'::jsonb,
  dismiss_phrases jsonb not null default '[]'::jsonb,
  alarm_settings jsonb not null default '{"enabled": true}'::jsonb,
  timezone text not null default 'Asia/Seoul',
  updated_at bigint not null
);

alter table public.futureme_alarm_data enable row level security;

create policy "alarm data own" on public.futureme_alarm_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 웹 푸시 구독 (기기별)
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

create policy "push subs own" on public.futureme_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 중복 푸시 방지
create table if not exists public.futureme_alarm_push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  alarm_id text not null,
  date_key text not null,
  alarm_time text not null,
  sent_at bigint not null,
  primary key (user_id, alarm_id, date_key, alarm_time)
);

alter table public.futureme_alarm_push_sent enable row level security;

create policy "alarm push sent own" on public.futureme_alarm_push_sent
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists futureme_push_subscriptions_user on public.futureme_push_subscriptions (user_id, enabled);
