# iOS 네이티브 알람 (Capacitor + Mock)

AlarmKit **entitlement 승인 전**에 할 수 있는 작업을 모두 포함한 iOS 앱 골격입니다.

## 포함된 것 (승인 전)

| 기능 | 설명 |
|------|------|
| Capacitor iOS 프로젝트 | `app.futureme.studio` |
| WebView | 기존 React 앱 (채팅·목표·알람 UI) |
| `FutureMeAlarm` Bridge | JS ↔ Swift 플러그인 |
| **Mock 모드** | AlarmKit 없이 UserDefaults + 이벤트 |
| **알람 울림 시뮬레이션** | 따라치기(`안녕`) 전체 화면 + 소리 |
| **네이티브 동기화** | 알람 저장 시 Swift에 전달 |
| **5초 뒤 로컬 알림** | 약한 대용 (AlarmKit 아님) |
| 웹 개발(mock) | 브라우저에서도 시뮬레이션 UI 표시 |

## 승인 후에 할 일

1. [AlarmKit entitlement 신청](https://developer.apple.com/contact/request/alarmkit)
2. `FutureMeAlarmPlugin.swift`에서 `useAlarmKit = true` + AlarmManager 연동
3. `Info.plist`에 `NSAlarmKitUsageDescription` 추가
4. 실기기 end-to-end 테스트

---

## 로컬 개발 (Mac)

**필요:** Xcode, CocoaPods (`brew install cocoapods`)

```bash
chmod +x scripts/setup-ios.sh
./scripts/setup-ios.sh   # 최초 1회 — ios/ 생성 + sync
bun run ios:open         # Xcode
```

또는 수동:

```bash
bun install
bun run build
bunx cap add ios      # 최초 1회
bunx cap sync ios
bunx cap open ios
```

### Vite 라이브 리로드 (선택)

`capacitor.config.ts`의 `server.url` 주석 해제 후 `bun run dev:chat` + `cap sync ios`

---

## AlarmKit entitlement 신청 예시 (영문)

**Bundle ID:** app.futureme.studio  

> Future Me is a morning commitment alarm app. Users set wake-up alarms and must type a personalized affirmation phrase to dismiss the alarm. AlarmKit is required so alarms fire reliably on the lock screen when the app is not running. This is the app's core feature.
