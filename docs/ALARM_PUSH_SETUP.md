# 알람 푸시 (잠금 화면) 설정

앱이 꺼져 있거나 잠금 화면일 때 알람을 보내려면 **Supabase Edge Function + 웹 푸시**가 필요합니다.

## 1. SQL 실행

Supabase SQL Editor에서 `supabase/schema.sql` **맨 아래 알람·푸시 블록**을 실행하세요.

## 2. VAPID 키 생성

```bash
npx web-push generate-vapid-keys
```

| 어디 | 변수 |
|------|------|
| Vercel (Studio) | `VITE_VAPID_PUBLIC_KEY` = public key |
| Supabase Edge Function secrets | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` |
| Supabase Edge Function secrets | `ALARM_CRON_SECRET` (임의 문자열) |

## 3. Edge Function 배포

```bash
cd FutureMe-studio
supabase functions deploy alarm-push --no-verify-jwt
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=mailto:you@example.com ALARM_CRON_SECRET=...
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 함수에 자동 주입합니다.

## 4. 매분 크론 (pg_cron)

SQL Editor 예시 (URL·시크릿은 본인 값으로):

```sql
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
```

`pg_cron` / `pg_net` 확장이 켜져 있어야 합니다 (Supabase Dashboard → Database → Extensions).

## 5. 앱에서 (iPhone)

1. Safari → **홈 화면에 추가**
2. 홈 화면 아이콘으로 열기
3. **Google 로그인**
4. **알람** 탭 → **알림 허용하기**

## 6. 동작

1. 알람·다짐 → Supabase `futureme_alarm_data` 동기화
2. 푸시 구독 → `futureme_push_subscriptions`
3. 매분 크론 → 해당 시각 사용자에게 푸시
4. 알림 탭 → `?alarm=1&...` 로 앱 열림 → **따라치기** 화면

## 제한

- **전원 완전 OFF**: 불가
- **앱 강제 종료**: iOS는 푸시는 오지만, 탭해야 따라치기 화면
- **알람음 무한 반복**: 잠금 중에는 OS 알림음 1회 → 앱 열면 반복
