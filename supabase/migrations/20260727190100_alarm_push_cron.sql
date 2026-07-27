-- pg_cron: 매분 alarm-push Edge Function 호출
-- YOUR_PROJECT / YOUR_ALARM_CRON_SECRET 을 본인 값으로 바꾼 뒤 SQL Editor에서 실행
-- Database → Extensions 에서 pg_cron, pg_net 이 켜져 있어야 합니다.

-- select cron.unschedule('futureme-alarm-push');  -- 재등록 시

select cron.schedule(
  'futureme-alarm-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/alarm-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alarm-cron-secret', 'YOUR_ALARM_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
