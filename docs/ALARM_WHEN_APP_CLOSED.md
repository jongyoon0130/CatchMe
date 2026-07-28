# 앱을 안 열어도 알람 울리게 하기

## 솔직한 한 줄

| 방식 | 앱 꺼도 울림 | 시계앱처럼 100% |
|------|-------------|----------------|
| **홈 화면 PWA + 서버 푸시 + cron** | cron 켜져 있으면 ⭕ | ❌ (가끔 안 올 수 있음) |
| **iOS 네이티브 앱 + 로컬 알림 예약** | ⭕ | △ |
| **iOS + AlarmKit (Apple 승인)** | ⭕ | ⭕ |

지금 웹앱(PWA)만 쓰면 **서버가 매분 푸시를 보내줘야** 앱을 안 열어도 울려요.  
이 **cron이 꺼져 있으면** 앱 열 때만 알람이 옵니다.

---

## 지금 PWA에서 꼭 해야 할 것 (순서)

### 1. Supabase Extensions
Dashboard → Database → Extensions → **pg_cron**, **pg_net** 켜기

### 2. SQL (아직 안 했다면)
`supabase/migrations/20260728210000_fix_push_subscriptions.sql`  
`supabase/migrations/20260728220000_alarm_cron_heartbeat.sql`  
`setup-ready-dwawzmxungglfsluurjv.sql` 의 **② cron** 블록

### 3. Edge Function 배포
```bash
./scripts/setup-alarm-push.sh
```
또는 Dashboard에서 `alarm-push` 함수 Deploy + Secrets

### 4. cron 확인
SQL Editor:
```sql
select * from cron.job where jobname = 'futureme-alarm-push';
select * from public.futureme_alarm_cron_heartbeat;
```
`last_run_at` 이 **1~2분 이내**면 cron 정상.

### 5. 앱에서
- 홈 화면 앱 → 로그인 → 알림 허용 → **연결하기**
- **「알람 준비 완료」** + cron 경고 없음
- **잠금 화면 알림 테스트** → 앱 종료 후 알림 확인

---

## cron 대안 (Supabase pg_cron이 안 될 때)

[cron-job.org](https://cron-job.org) 무료:

- URL: `https://dwawzmxungglfsluurjv.supabase.co/functions/v1/alarm-push`
- Method: POST
- Header: `x-alarm-cron-secret: (ALARM_CRON_SECRET 값)`
- Body: `{}`
- **매 1분**

---

## 100% 시계앱급을 원하면

1. Mac + Xcode로 **Capacitor iOS 앱** 빌드
2. Apple에 **AlarmKit entitlement** 신청 (`docs/IOS_NATIVE_ALARM.md`)
3. 승인 후 App Store / TestFlight 설치

그 전까지는 네이티브 앱에서 **로컬 알림 예약**(UNCalendarNotificationTrigger)도 동기화됩니다 — PWA보다 훨씬 안정적.
