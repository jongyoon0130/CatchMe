# iOS 네이티브 알람 (Capacitor + AlarmKit)

iOS 26+ **AlarmKit** 으로 시스템 알람을 스케줄합니다. Apple 사전 entitlement 신청 없이 framework import + 사용자 허용으로 동작합니다.

## 포함된 것

| 기능 | 설명 |
|------|------|
| Capacitor iOS 프로젝트 | `app.futureme.studio` |
| `FutureMeAlarm` Bridge | JS ↔ Swift — **AlarmKit** 스케줄링 |
| **AlarmKit** | 잠금 화면 시스템 알람 (앱 꺼도 울림) |
| **로컬 알림 폴백** | AlarmKit 실패 시 UNNotification |
| **따라치기 UI** | 알람 울릴 때 `alarmFired` → 오버레이 |

## 필수 설정

1. **Minimum Deployment iOS 26.0**
2. **Info.plist** — `NSAlarmKitUsageDescription`
3. 앱에서 **AlarmKit 알람 허용** (알람 탭 → 알람 권한)

## 로컬 개발 (Mac)

```bash
cd FutureMe-studio
bun install
bun run build:ios
open ios/App/App.xcworkspace
```

Xcode ▶ Run → 알람 탭 → **알람 권한 (AlarmKit)** → **5초 뒤 AlarmKit 테스트**

## AlarmKit 신청?

공식 문서 기준 **별도 Apple entitlement 신청 불필요**. Capability 목록에 없어도 정상일 수 있습니다.
