# Supabase 대시보드 설정 — dwawzmxungglfsluurjv

로그인: https://supabase.com/dashboard/project/dwawzmxungglfsluurjv

## 1) SQL (테이블) — 1분

SQL Editor → New query → 아래 파일 내용 **통째로** 붙여넣기 → Run

`supabase/setup-ready-dwawzmxungglfsluurjv.sql`  
(처음 `-- ② cron` 블록 **제외**하고, `-- ① 테이블` 부분만 먼저 실행해도 됨)

## 2) Extensions — 30초

Database → Extensions → Enable

- pg_cron
- pg_net

## 3) Edge Function — 3분

Edge Functions → Create → Via Editor

- Name: `alarm-push`
- Verify JWT: **OFF**
- Code: `supabase/functions/alarm-push/index.ts` 복사
- Deploy

## 4) Secrets — 1분

Project Settings → Edge Functions → Secrets (또는 Functions → Secrets)

`.env.alarm-push.local` 파일에 있는 값 그대로 4개:

| Name | 
|------|
| VAPID_PUBLIC_KEY |
| VAPID_PRIVATE_KEY |
| VAPID_EMAIL |
| ALARM_CRON_SECRET |

## 5) cron SQL — 30초

SQL Editor → `setup-ready-dwawzmxungglfsluurjv.sql` 맨 아래 `-- ② cron` 부분만 Run

## 6) Auth redirect

Authentication → URL Configuration → Redirect URLs 추가:

- https://future-me-studio.vercel.app
- http://127.0.0.1:5173

## 7) 폰 테스트

홈 화면 추가 → 로그인 → 알람 탭 → 알림 허용 → 알람 설정
