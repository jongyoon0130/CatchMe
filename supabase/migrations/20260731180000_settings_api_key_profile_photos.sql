-- Gemini API key (계정 동기화) + 미래 카메라 사진 (프로필별)

alter table public.futureme_settings
  add column if not exists gemini_api_key text;

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
