-- AI 프록시 사용량 — "한 사람이 오늘 몇 번 썼는가"만 센다.
--
-- 왜 필요한가:
--   프록시 주소는 인터넷에 공개된다. 로그인 확인만 있고 횟수 제한이 없으면
--   계정 하나로 밤새 돌려 우리 Gemini 하루 한도를 통째로 태울 수 있다.
--
-- 개인정보는 담지 않는다. user_id · 날짜 · 횟수뿐이고 대화 내용은 남기지 않는다.

create table if not exists public.futureme_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  used int not null default 0,
  primary key (user_id, day)
);

alter table public.futureme_ai_usage enable row level security;
-- 정책을 하나도 두지 않는 것이 의도다: 로그인한 유저도 이 표를 읽거나 고칠 수 없고,
-- service_role 을 가진 서버 함수만 RLS 를 우회해 접근한다.
-- (유저가 고칠 수 있으면 한도가 한도가 아니다)

-- 한 번 쓰기를 한 문장으로 처리한다.
-- select 로 읽고 update 로 나누면, 동시에 들어온 두 요청이 같은 값을 읽어
-- 한도를 넘겨버린다. insert ... on conflict 는 그 틈이 없다.
create or replace function public.consume_ai_quota(p_user uuid, p_limit int)
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  insert into public.futureme_ai_usage as u (user_id, day, used)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update set used = u.used + 1
  returning u.used into v_used;

  return query select v_used <= p_limit, v_used;
end;
$$;

-- 서버 함수(service_role)만 부를 수 있게 한다. 브라우저에서는 못 부른다.
revoke all on function public.consume_ai_quota(uuid, int) from public;
revoke all on function public.consume_ai_quota(uuid, int) from anon;
revoke all on function public.consume_ai_quota(uuid, int) from authenticated;

-- 지난 기록은 자동으로 지우지 않는다. 하루에 사람당 한 줄이라 아주 느리게 쌓이고,
-- "어제까지 얼마나 썼나"를 볼 수 있는 편이 낫다. 커지면 그때 정리한다.
