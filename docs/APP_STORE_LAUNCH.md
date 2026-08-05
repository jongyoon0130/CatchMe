# App Store 출시 체크리스트 (Developer 활성화 후)

순서대로 진행하세요. ✅ = 코드/문서 준비됨, 🔧 = Apple/Supabase에서 직접.

---

## Phase 1 — Apple Developer (30~60분) 🔧

### 1-1. App ID
1. [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**
2. **Identifiers** → **+** → **App IDs** → `app.futureme.studio`
3. **Sign in with Apple** ✅ → Save

### 1-2. Services ID (웹 OAuth + Supabase Apple)
1. **Identifiers** → **+** → **Services IDs**
2. Identifier: `app.futureme.studio.web`
3. Sign in with Apple → Configure
4. Primary App ID: `app.futureme.studio`
5. Domains: `dwawzmxungglfsluurjv.supabase.co`, `future-me-studio.vercel.app`
6. Return URLs: `https://dwawzmxungglfsluurjv.supabase.co/auth/v1/callback`

### 1-3. Sign in with Apple Key
1. **Keys** → **+** → Sign in with Apple
2. `.p8` 다운로드 (한 번만!) · **Key ID** · **Team ID** 메모

상세: [`APPLE_SIGN_IN.md`](./APPLE_SIGN_IN.md)

---

## Phase 2 — Supabase (15분) 🔧

### Apple Provider
**Authentication → Providers → Apple** Enable

| 필드 | 값 |
|------|-----|
| Client IDs (순서!) | 1) `app.futureme.studio.web` 2) `app.futureme.studio` |
| Secret Key | `.p8` JWT |
| Key ID / Team ID | Apple에서 복사 |

### Redirect URLs
**Authentication → URL Configuration** → Redirect URLs:

```
https://future-me-studio.vercel.app
http://localhost:5173
app.futureme.studio://auth/callback
```

---

## Phase 2b — 코드 배포 (Mac) ✅

```bash
cd ~/Desktop/창업/FutureMe-studio
git pull origin main
bun run build:ios
bun run ios:open
```

---

## Phase 3 — Xcode 서명 & Capability (20분) 🔧

1. Xcode → **App** 타겟 → **Signing & Capabilities**
2. **Team**: 본인 Developer 팀 선택
3. **+ Capability** → **Sign in with Apple**
4. Bundle ID: `app.futureme.studio` 확인
5. **Product → Clean Build Folder** → ▶ Run (실기기 또는 시뮬레이터)

### 실기기 테스트
- iPhone USB 연결 → 상단에서 본인 기기 선택 → Run
- **Apple 로그인** / **Google 로그인** 각각 1회
- 홈·채팅·알람·**알람 울림 시뮬레이션**

---

## Phase 4 — TestFlight (30분) 🔧

1. Xcode → **Product → Archive**
2. **Distribute App** → **App Store Connect** → Upload
3. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** New App
   - Name: Future Me
   - Bundle ID: `app.futureme.studio`
   - SKU: `futureme-studio`
4. TestFlight → 내부 테스트 → 본인 iPhone 설치

---

## Phase 4b — Mac (Apple Silicon) 앱 아이콘 설치 🔧

iPhone/iPad 앱을 **M1/M2/M3/M4 맥북**에서 App Store·TestFlight로 설치 (Mac Catalyst 별도 앱 아님).

### 코드 (✅ 적용됨)

Xcode 타깃 `App` → `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = YES`  
(iPad 앱을 Mac에서 실행 허용)

### App Store Connect (한 번)

1. **Future Me → 일반 → Mac** (또는 **가격 및 사용 가능 여부**)
2. **「Apple Silicon Mac에서 iPad 앱 사용」** ✅ 켜기
3. 새 빌드(TestFlight/App Store) 업로드 후 Mac에서도 배포됨

### 맥에서 설치

1. Mac App Store에서 **TestFlight** 설치 (Apple Silicon)
2. iPhone과 같은 **futureme** 그룹 / 같은 Apple ID
3. Future Me → **설치** → Dock·Launchpad에 아이콘

### 제한

| | Mac | iPhone |
|---|---|---|
| 홈·채팅·목표 | ✅ | ✅ |
| 할 일 로컬 알림 | △ (iPad-on-Mac 정책에 따름) | ✅ |
| AlarmKit 잠금 알람 | ❌ | ✅ (iOS 26+) |
| **Intel 맥** | ❌ Apple Silicon만 | — |

로컬 확인: Xcode → 실행 대상 **My Mac (Designed for iPad)** → ⌘R

---

## Phase 5 — App Store Connect 메타데이터 (1~2시간) 🔧

### 스크린샷
- iPhone 6.7" (필수): 홈·채팅·알람·로그인
- 시뮬레이터 **Cmd+S** 또는 실기기

### 앱 설명 (예시 톤)
- 목표·할 일·미래의 나와 대화
- AI는 **본인 Gemini API 키** (Google AI Studio 무료)
- 알림·리마인더 (100% 시계앱 보장 X — 과장 금지)

### App Privacy (Nutrition Labels)
- 이메일, 사용자 콘텐츠(채팅·목표), 식별자
- Gemini API 키: 사용자 제공, 앱 기능용

### 심사 메모 (App Review Information)
```
Test Google account: [이메일] / [비밀번호]
Gemini API key for AI: AIza... (paste in Chat → ⚙️ settings)
Steps: Login → Chat → ⚙️ paste key → send message
Without key: goals/alarms still work; chat uses limited fallback
```

---

## Phase 6 — AlarmKit (선택, 비동기) 🔧

잠금 화면 **시계급** 알람 → 별도 Apple 승인 (수 주)

1. [`IOS_NATIVE_ALARM.md`](./IOS_NATIVE_ALARM.md) 영문 신청문
2. 승인 후 `FutureMeAlarmPlugin.swift` → `useAlarmKit = true`

**지금 출시:** Mock 알람 + 푸시 알림으로도 가능 (설명만 과장하지 말 것)

---

## Phase 7 — 심사 제출 🔧

1. App Store Connect → **Prepare for Submission**
2. 빌드 선택 (TestFlight 업로드본)
3. **Submit for Review**

첫 제출 거절은 흔함 → 사유 수정 → 재제출.

---

## 빠른 확인표

| 항목 | 상태 |
|------|------|
| Apple 로그인 UI | ✅ 코드 |
| Google iOS OAuth deep link | ✅ 코드 |
| Sign in with Apple 네이티브 | ✅ 코드 |
| Apple Developer App ID + Key | 🔧 지금 |
| Supabase Apple + redirect | 🔧 지금 |
| Xcode Sign in with Apple | 🔧 지금 |
| TestFlight | 🔧 Phase 4 |
| 심사 메모 + Gemini 키 | 🔧 Phase 5 |
