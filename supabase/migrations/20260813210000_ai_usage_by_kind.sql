-- 사용량을 종류별로 센다 — 채팅(chat)과 미래 사진(image)을 따로.
--
-- 왜: 사진은 글자보다 몇십 배 비싸다. 같은 통에서 하루 200번을 나눠 쓰면
--     사진 몇 장이 하루치를 통째로 태운다. 사진은 하루 1회로 따로 막는다.
--
-- 기존 행은 'chat'으로 남는다 (default). 지금까지 센 값은 지워지지 않는다.

alter table public.futureme_ai_usage
  add column if not exists kind text not null default 'chat';

-- 기본키에 kind를 넣어 (user_id, day, kind) 조합마다 따로 세게 한다.
alter table public.futureme_ai_usage
  drop constraint if exists futureme_ai_usage_pkey;

alter table public.futureme_ai_usage
  add constraint futureme_ai_usage_pkey primary key (user_id, day, kind);

-- 한 번 쓰기를 한 문장으로 처리하는 건 그대로다.
-- select 로 읽고 update 로 나누면 동시에 들어온 두 요청이 같은 값을 읽어 한도를 넘긴다.
create or replace function public.consume_ai_quota(p_user uuid, p_limit int, p_kind text default 'chat')
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  insert into public.futureme_ai_usage as u (user_id, day, kind, used)
  values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set used = u.used + 1
  returning u.used into v_used;

  return query select v_used <= p_limit, v_used;
end;
$$;

-- 서버 함수(service_role)만 부를 수 있게 한다. 브라우저에서는 못 부른다.
revoke all on function public.consume_ai_quota(uuid, int, text) from public;
revoke all on function public.consume_ai_quota(uuid, int, text) from anon;
revoke all on function public.consume_ai_quota(uuid, int, text) from authenticated;

-- 인자가 2개이던 옛 함수는 남겨두면 어느 쪽이 불릴지 헷갈린다. 지운다.
drop function if exists public.consume_ai_quota(uuid, int);
