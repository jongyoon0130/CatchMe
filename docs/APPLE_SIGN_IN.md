# Sign in with Apple 설정

Future Me는 Google과 함께 **Apple 로그인**을 제공합니다 (App Store 가이드라인 4.8).

| 환경 | 방식 |
|------|------|
| 웹 / Android | Supabase OAuth (`signInWithOAuth`) |
| iOS 앱 (Capacitor) | 네이티브 Apple 로그인 → `signInWithIdToken` |

코드: `src/lib/appleAuth.ts`, `src/contexts/AuthContext.tsx`

---

## 1. Apple Developer (계정 활성화 후)

### App ID

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers**
2. `app.futureme.studio` App ID 선택 (없으면 생성)
3. **Sign in with Apple** 체크 → Save

### Services ID (웹 OAuth용)

1. **+** → **Services IDs**
2. Identifier 예: `app.futureme.studio.web`
3. **Sign in with Apple** 활성화 → Configure
4. **Primary App ID**: `app.futureme.studio`
5. **Domains and Subdomains**:
   - `YOUR_PROJECT.supabase.co`
   - 배포 도메인 (예: `future-me-studio.vercel.app`)
6. **Return URLs**:
   - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - `https://future-me-studio.vercel.app` (배포 URL)
   - `http://localhost:5173` (로컬)

### Sign in with Apple Key (.p8)

1. **Keys** → **+** → **Sign in with Apple**
2. Primary App ID: `app.futureme.studio`
3. `.p8` 파일 다운로드 (한 번만 가능 — 안전하게 보관)
4. Key ID, Team ID 메모

---

## 2. Supabase Dashboard

**Authentication → Providers → Apple** 활성화

| 필드 | 값 |
|------|-----|
| Client IDs | **Services ID를 첫 번째**로, 그다음 `app.futureme.studio` |
| Secret Key | `.p8`로 생성한 JWT (Supabase UI 안내 따름) |
| Key ID | Apple Key ID |
| Team ID | Apple Team ID |

> **중요:** Client IDs 목록에서 **Services ID가 맨 위**여야 웹 OAuth가 동작합니다.  
> 네이티브 iOS는 목록에 `app.futureme.studio`만 있어도 `signInWithIdToken`이 동작합니다.

**Authentication → URL Configuration** — Redirect URLs에 아래 **모두** 포함:

- `https://future-me-studio.vercel.app`
- `http://localhost:5173`
- `app.futureme.studio://auth/callback` ← **iOS 앱 Google/Apple OAuth**

---

## 3. iOS Xcode (Capacitor)

Mac에서:

```bash
./scripts/setup-ios.sh
bun run ios:open
```

Xcode → **App** 타겟 → **Signing & Capabilities**:

1. Team: 본인 Apple Developer 팀
2. **+ Capability** → **Sign in with Apple**

그다음:

```bash
bun run build:ios
```

실기기에서 Apple 로그인 테스트 (시뮬레이터는 Apple ID 로그인 필요).

---

## 4. Secret Key 6개월 갱신 (웹 OAuth만)

웹/Supabase OAuth 방식은 Apple **Secret Key(JWT)를 6개마다** 갱신해야 합니다.  
iOS 네이티브 `signInWithIdToken`만 쓰는 경우에는 해당 없습니다.  
Future Me는 웹도 OAuth를 쓰므로 **캘린더에 6개월마다 갱신**을 넣어두세요.

---

## 5. 문제 해결

| 증상 | 확인 |
|------|------|
| 웹에서 Apple 로그인 실패 | Services ID가 Client IDs **첫 번째**인지, Return URL 일치 |
| iOS 네이티브 실패 | App ID에 Sign in with Apple, Xcode Capability |
| `Invalid token` | Supabase Client IDs에 `app.futureme.studio` 포함 |
| 이름이 비어 있음 | Apple은 **첫 로그인**에만 이름 제공 — 앱이 `updateUser`로 저장 |
