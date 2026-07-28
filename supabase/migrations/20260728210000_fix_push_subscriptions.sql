-- futureme_push_subscriptions 스키마 보정 (연결하기 / 클라우드 저장 실패 수정)
-- Supabase SQL Editor에서 Run

alter table public.futureme_push_subscriptions
  add column if not exists id uuid default gen_random_uuid();

alter table public.futureme_push_subscriptions
  add column if not exists enabled boolean not null default true;

alter table public.futureme_push_subscriptions
  add column if not exists timezone text not null default 'Asia/Seoul';

alter table public.futureme_push_subscriptions
  add column if not exists updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint;

alter table public.futureme_push_subscriptions
  add column if not exists subscription jsonb;

alter table public.futureme_push_subscriptions
  add column if not exists endpoint text;

-- upsert(onConflict: user_id,endpoint) 에 필요
create unique index if not exists futureme_push_subscriptions_user_endpoint
  on public.futureme_push_subscriptions (user_id, endpoint);

alter table public.futureme_push_subscriptions enable row level security;

drop policy if exists "push subs own" on public.futureme_push_subscriptions;
create policy "push subs own" on public.futureme_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
