import AppIntents
import FuturemeAlarm

/// App Intents는 main app target 에 있어야 잠금 화면 AlarmKit 버튼에서 동작한다.
enum FutureMeAlarmIntentRegistry {
    static func install() {
        guard #available(iOS 26.0, *) else { return }
        AlarmKitBridge.registerIntentFactories(
            open: { alarmID in FutureMeOpenDismissIntent(alarmID: alarmID) },
            stop: { alarmID in FutureMeStopCaptureIntent(alarmID: alarmID) }
        )
    }
}

private let _futureMeAlarmIntentBootstrap: Void = {
    FutureMeAlarmIntentRegistry.install()
}()

/// 「따라치기」 — 앱을 열고 따라치기 UI
@available(iOS 26.0, *)
struct FutureMeOpenDismissIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "따라치기"
    static var description = IntentDescription("Future Me 앱을 열어 다짐을 따라 칩니다.")
    static var openAppWhenRun: Bool = true
    static var supportedModes: IntentModes { .foreground(.immediate) }
    static var persistentIdentifier: String = "app.futureme.studio.open-dismiss"

    @Parameter(title: "AlarmKit ID")
    var alarmID: String

    init() {
        self.alarmID = ""
    }

    init(alarmID: String) {
        self.alarmID = alarmID
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        FutureMeAlarmKitActions.stageOpenDismiss(alarmKitId: alarmID)
        return .result()
    }
}

/// 슬라이드로 끄려 할 때 — 문구 미완료면 재울림 예약
@available(iOS 26.0, *)
struct FutureMeStopCaptureIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "알람 끄기"
    static var description = IntentDescription("Future Me 알람 해제 처리")
    static var persistentIdentifier: String = "app.futureme.studio.stop-capture"

    @Parameter(title: "AlarmKit ID")
    var alarmID: String

    init() {
        self.alarmID = ""
    }

    init(alarmID: String) {
        self.alarmID = alarmID
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        await FutureMeAlarmKitActions.handleSwipeStop(alarmKitId: alarmID)
        return .result()
    }
}

@available(iOS 26.0, *)
struct FutureMeAlarmShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: FutureMeOpenDismissIntent(),
            phrases: [
                "\(.applicationName) 따라치기",
                "\(.applicationName) 알람 해제",
            ],
            shortTitle: "따라치기",
            systemImageName: "keyboard"
        )
    }
}
