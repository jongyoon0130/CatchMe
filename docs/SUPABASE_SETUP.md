# Catch Me — Supabase + Google / Apple 로그인 설정

클라우드 동기화와 Google·Apple 로그인을 쓰려면 **TalkBack과 별도** Supabase 프로젝트를 만들고 아래 순서대로 설정하세요.

## 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project** (예: `futureme`)
2. **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
   - 이미 프로젝트가 있으면, 파일 맨 아래 `futureme_goal_data` 블록만 추가 실행해도 됩니다.
   - **2026-07-22 추가:** 반복 일정용 `routines` 컬럼. 이미 테이블을 만들었다면 아래 한 줄만 더 실행하세요.
     안 해도 앱은 돌아갑니다 — 반복 일정만 이 기기에 남고 클라우드로 안 넘어갑니다.

     ```sql
     alter table public.futureme_goal_data
       add column if not exists routines jsonb not null default '[]'::jsonb;
     ```
3. **Project Settings → API** 에서 복사:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`

## 2. Google OAuth (Supabase)

1. Supabase **Authentication → Providers → Google** 활성화
2. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 클라이언트 ID (웹) 생성
3. **Authorized redirect URIs**:
   ```
   https://YOUR_PROJECT.supabase.co/auth/v1/callback
   ```
4. Client ID / Secret → Supabase Google provider 입력

## 2b. Sign in with Apple (Supabase)

App Store 제출을 위해 Google과 함께 Apple 로그인이 필요합니다.  
**상세:** [`docs/APPLE_SIGN_IN.md`](./APPLE_SIGN_IN.md)

요약:

1. Apple Developer: App ID `app.futureme.studio` + Services ID + `.p8` Key
2. Supabase **Authentication → Providers → Apple** — Services ID를 Client IDs **첫 번째**로
3. iOS: Xcode → Sign in with Apple capability

## 3. Redirect URL (Supabase Auth)

**Authentication → URL Configuration**

| 항목 | 값 |
|------|-----|
| Site URL | `https://futureme-beta.vercel.app` |
| Redirect URLs | 아래 **모두** 추가 |

예 (현재 Catch Me 프로덕션):
- `https://futureme-beta.vercel.app`
- `https://future-me-studio.vercel.app`
- `http://localhost:5173`
- `app.futureme.studio://auth/callback` ← **iOS/Android Capacitor OAuth**

## 4. 환경 변수

### 로컬

```bash
cp .env.example .env
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력
bun install
bun run dev
```

### Vercel

Project → **Settings → Environment Variables**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

저장 후 **Redeploy**.

### Xcode Cloud (iOS 앱) ← 빠뜨리기 쉬움

**웹(Vercel)에 넣은 것과 별개로 여기에도 넣어야 합니다.** 앱은 Vercel이 아니라
Xcode Cloud가 따로 빌드하기 때문에, 웹이 잘 된다고 앱도 되는 게 아닙니다.

App Store Connect → **Xcode Cloud** → 워크플로 **[Edit]** → **[Environment]**
→ *Environment Variables* 에 `+` 로 두 개:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> 값에 따옴표를 붙이지 마세요. `.env` 파일에서 복사할 때 `VITE_...=` 앞부분과
> 따옴표는 빼고 **값만** 넣습니다.

**넣지 않으면 어떻게 되나 (2026-08-13에 실제로 겪음):**
빌드는 그냥 성공하는데, 나온 앱에는 **로그인 화면이 아예 없고**(`AccountSettingsSection`이
`configured=false`면 아무것도 안 그림) **AI도 안 됩니다**(AI는 로그인한 사람만 쓰는
서버 프록시를 거친다 — §5b). 그런 앱이 TestFlight까지 나갔다.

지금은 [`ios/App/ci_scripts/ci_post_clone.sh`](../ios/App/ci_scripts/ci_post_clone.sh)가
빌드 앞에서 이 값을 확인하고, 없으면 **빌드를 멈추고** 무엇이 없는지 알려준다.
값이 있으면 빌드 로그에 이렇게 찍히므로 TestFlight를 기다리지 않고 확인할 수 있다:

```
==> Supabase 환경변수 확인
    VITE_SUPABASE_URL      = https://<프로젝트>.supabase.co
    VITE_SUPABASE_ANON_KEY = (설정됨 · 208자)
```

환경변수를 바꿨으면 **빌드를 다시 돌려야** 반영됩니다.

## 5. 동작

| 상황 | 동작 |
|------|------|
| env 없음 | 로그인 없이 로컬 전용 |
| Google 로그인 | 프로필·채팅·홈 목표·할 일 클라우드 동기화 |
| Apple 로그인 | Google과 동일 (웹 OAuth / iOS 네이티브) |
| Gemini API 키 | **기기 localStorage만** — 클라우드로 보내지 않는다 (§5b 프록시를 켜면 유저는 넣을 필요도 없다) |

## 5b. AI 프록시 (`gemini` 함수) — 유저가 키를 넣지 않아도 되게

서버가 **우리 키 하나**로 구글을 대신 부른다. 유저 기기에는 키가 가지 않고,
우리도 유저 키를 갖지 않는다.

### 한 번만 하는 준비

```bash
# 1) 사용량 표 만들기 — Supabase SQL Editor에 붙여넣기
#    supabase/migrations/20260812090000_ai_proxy_usage.sql 내용 전체

# 2) 우리 Gemini 키를 서버에만 등록 (여기 말고는 어디에도 두지 않는다)
bunx supabase secrets set GEMINI_API_KEY='발급받은_키'

# 3) 하루 한도 (선택 — 기본 50)
bunx supabase secrets set AI_DAILY_LIMIT='50'

# 4) 함수 배포 — verify_jwt 기본값이라 로그인한 사람만 부를 수 있다
bunx supabase functions deploy gemini
```

> ⚠️ `--no-verify-jwt` 를 붙이면 **아무나 우리 키로 AI를 쓸 수 있다.** 붙이지 말 것.

### 배포됐는지 확인

로그인 없이 부르면 막혀야 정상이다:

```bash
curl -s -X POST 'https://<프로젝트>.supabase.co/functions/v1/gemini' \
  -H 'Content-Type: application/json' -d '{}' | head -c 200
```

`401` 이 나오면 성공 — 로그인한 사람만 통과한다는 뜻이다.

로그인한 상태의 실제 응답까지 보려면, 앱에서 로그인한 뒤 브라우저 콘솔에서:

```js
const { data } = await window.supabase.auth.getSession()
await fetch('https://<프로젝트>.supabase.co/functions/v1/gemini', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
  body: JSON.stringify({ body: { contents: [{ role: 'user', parts: [{ text: '안녕' }] }] } }),
}).then(r => r.json()).then(console.log)
```

### 한도

- 사람당 하루 `AI_DAILY_LIMIT` 회 (기본 50). 넘으면 429 + `PROXY_DAILY_LIMIT`
- **채팅 한 턴 = 요청 한 건이 아니다.** 답변 외에 대화 요약·인사이트 추출이 가끔
  따로 나가서, "하루 30턴"은 요청으로 50건쯤 된다
- 무료 등급 한도는 **키가 아니라 구글 클라우드 프로젝트 단위**다. 유저가 늘면
  우리 프로젝트 한도를 다 같이 나눠 쓴다

## 6. TalkBack과 분리

- DB 테이블: `futureme_profiles`, `futureme_chats`, `futureme_settings`, `futureme_goal_data`
- TalkBack(`talkback_*`)과 **데이터 섞이지 않음**
