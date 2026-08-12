import Foundation
import Capacitor
import UserNotifications
import UIKit
import AudioToolbox

@objc(FutureMeAlarmPlugin)
public class FutureMeAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FutureMeAlarmPlugin"
    public let jsName = "FutureMeAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "simulateAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleTestNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopActiveAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingDismiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAllPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pulseAlarmHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAlertMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDebugInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refillChain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncTaskReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTaskReminderCount", returnType: CAPPluginReturnPromise),
    ]

    private let storageKey = "futureme-native-alarms-json"

    override public func load() {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                AlarmKitBridge.shared.setAlertHandler { [weak self] pending in
                    self?.notifyAlarmFired(pending)
                }
                AlarmKitBridge.shared.startObserving()
                self.observeAppBecomeActive()
                self.deliverPendingDismissIfNeeded()
            }
        }
        #endif
    }

    private func observeAppBecomeActive() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                Task { @MainActor in
                    self?.deliverPendingDismissIfNeeded()
                    await AlarmKitBridge.shared.refillAwaitingPlans()
                }
            }
            #endif
        }
    }

    // MARK: - 따라치기

    @objc func getPendingDismiss(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                guard let pending = AlarmKitBridge.shared.pendingDismiss() else {
                    call.resolve(["pending": false])
                    return
                }
                call.resolve(Self.pendingPayload(pending, includePendingFlag: true))
            }
            return
        }
        #endif
        call.resolve(["pending": false])
    }

    /// 다짐 완료 — 남은 울림·푸시 전부 취소
    @objc func stopActiveAlarm(_ call: CAPPluginCall) {
        let alarmKitId = call.getString("alarmKitId")
        let alarmId = call.getString("alarmId")

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                await AlarmKitBridge.shared.completePlan(alarmId: alarmId, kitId: alarmKitId)
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": false, "detail": "AlarmKit unavailable"])
    }

    @objc func cancelAllPending(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                await AlarmKitBridge.shared.cancelEverything()
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        FutureMeAlarmNotificationBridge.cancelAllFutureMePushes()
        call.resolve(["ok": true])
    }

    @objc func refillChain(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                await AlarmKitBridge.shared.refillAwaitingPlans()
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": true])
    }

    // MARK: - 상태

    @objc func getStatus(_ call: CAPPluginCall) {
        let count = loadStoredAlarms().count

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                let permission = AlarmKitBridge.shared.authorizationLabel()
                let notifySettings = await UNUserNotificationCenter.current().notificationSettings()
                call.resolve([
                    "platform": "ios",
                    "mode": "alarmkit",
                    "alarmKitEntitled": permission == "granted",
                    "notificationPermission": Self.notificationPermissionLabel(
                        notifySettings.authorizationStatus
                    ),
                    "alarmKitPermission": permission,
                    "scheduledCount": count,
                    "hasAwaitingPhrase": AlarmKitBridge.shared.hasAwaitingPhrasePlan(),
                    "alarmKitScheduledCount": AlarmKitBridge.shared.alarmKitScheduledCount(),
                    "message": permission == "granted"
                        ? "AlarmKit 활성 — 20초 간격 재울림 체인 예약됨"
                        : "설정 > Catch Me > 알람에서 허용해주세요",
                ])
            }
            return
        }
        #endif

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "platform": "ios",
                "mode": "mock",
                "alarmKitEntitled": false,
                "notificationPermission": Self.notificationPermissionLabel(settings.authorizationStatus),
                "scheduledCount": count,
                "message": "iOS 26+ 와 AlarmKit 이 필요합니다",
            ])
        }
    }

    @objc func getDebugInfo(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                let pendingRequests = await UNUserNotificationCenter.current().pendingNotificationRequests()
                call.resolve([
                    "plans": AlarmKitBridge.shared.planSummaries(),
                    "log": FutureMeAlarmStorage.readLog().reversed(),
                    "alarmKitScheduledCount": AlarmKitBridge.shared.alarmKitScheduledCount(),
                    "pendingPushCount": pendingRequests.filter {
                        $0.identifier.hasPrefix("futureme-")
                    }.count,
                    "alertMode": FutureMeAlarmStorage.loadAlertMode(),
                ])
            }
            return
        }
        #endif
        call.resolve(["plans": [], "log": FutureMeAlarmStorage.readLog().reversed()])
    }

    // MARK: - 동기화

    @objc func syncAlarms(_ call: CAPPluginCall) {
        guard let alarms = call.getArray("alarms") else {
            call.reject("alarms array required")
            return
        }
        if let alertMode = call.getString("alertMode") {
            FutureMeAlarmStorage.saveAlertMode(alertMode)
        }
        UserDefaults.standard.set(alarms, forKey: storageKey)

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                do {
                    let count = try await AlarmKitBridge.shared.syncAlarms(alarms)
                    call.resolve(["ok": true, "count": count, "mode": "alarmkit"])
                } catch {
                    FutureMeAlarmStorage.log("sync 실패: \(error.localizedDescription)")
                    call.resolve([
                        "ok": false,
                        "count": 0,
                        "mode": "error",
                        "detail": error.localizedDescription,
                    ])
                }
            }
            return
        }
        #endif

        call.resolve(["ok": true, "count": alarms.count, "mode": "mock"])
    }

    // MARK: - 테스트 · 권한 · 기타

    @objc func scheduleTestNotification(_ call: CAPPluginCall) {
        let seconds = call.getInt("seconds") ?? 5
        let label = call.getString("label") ?? "Catch Me 테스트"
        let phrase = call.getString("phrase") ?? "안녕"
        let alarmId = call.getString("alarmId") ?? "test"
        let time = call.getString("time") ?? "07:00"
        if let alertMode = call.getString("alertMode") {
            FutureMeAlarmStorage.saveAlertMode(alertMode)
        }

        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                do {
                    let result = try await AlarmKitBridge.shared.scheduleFixedTest(
                        seconds: seconds,
                        alarmId: alarmId,
                        label: label,
                        time: time,
                        phrase: phrase
                    )
                    call.resolve([
                        "ok": true,
                        "seconds": seconds,
                        "mode": "alarmkit",
                        "ringCount": result.ringCount,
                        "pushCount": result.pushCount,
                        "intentsAttached": result.intentsAttached,
                    ])
                } catch {
                    call.resolve([
                        "ok": false,
                        "mode": "error",
                        "detail": error.localizedDescription,
                    ])
                }
            }
            return
        }
        #endif
        call.resolve(["ok": false, "detail": "AlarmKit unavailable"])
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        Task {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )) ?? false

            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                let alarmPermission = await MainActor.run { () -> String in
                    AlarmKitBridge.shared.authorizationLabel()
                }
                var resolved = alarmPermission
                if alarmPermission != "granted" {
                    resolved = (try? await AlarmKitBridge.shared.requestAuthorization()) ?? alarmPermission
                }
                call.resolve([
                    "permission": resolved,
                    "notificationPermission": granted ? "granted" : "denied",
                ])
                return
            }
            #endif

            call.resolve([
                "permission": granted ? "granted" : "denied",
                "notificationPermission": granted ? "granted" : "denied",
            ])
        }
    }

    /// 홈 할 일 시간 → 로컬 푸시 예약 (웹 푸시 없이 iOS UNNotification)
    @objc func syncTaskReminders(_ call: CAPPluginCall) {
        let raw = call.getArray("reminders", [String: Any].self) ?? []
        let rows = TaskReminderScheduler.parseRows(raw)

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                allowed = true
            default:
                allowed = false
            }

            guard allowed else {
                call.resolve([
                    "ok": false,
                    "scheduled": 0,
                    "skipped": rows.count,
                    "detail": "notification_permission_required",
                ])
                return
            }

            TaskReminderScheduler.sync(rows: rows) { scheduled, skipped in
                call.resolve([
                    "ok": true,
                    "scheduled": scheduled,
                    "skipped": skipped,
                ])
            }
        }
    }

    @objc func getTaskReminderCount(_ call: CAPPluginCall) {
        TaskReminderScheduler.pendingTaskCount { count in
            call.resolve(["count": count])
        }
    }

    @objc func simulateAlarm(_ call: CAPPluginCall) {
        let alarmId = call.getString("alarmId") ?? ""
        let label = call.getString("label") ?? "알람"
        let time = call.getString("time") ?? "07:00"
        let phrase = call.getString("phrase") ?? "안녕"
        notifyListeners("alarmFired", data: [
            "alarmId": alarmId,
            "label": label,
            "time": time,
            "phrase": phrase,
            "dateKey": FutureMeAlarmStorage.todayDateKey(),
            "source": "simulate",
        ], retainUntilConsumed: true)
        call.resolve(["ok": true])
    }

    @objc func pulseAlarmHaptic(_ call: CAPPluginCall) {
        // JS가 진동이 필요할 때만 부른다 (모드 판단은 JS 쪽) — 여기서 모드를 다시 검사하면
        // 모드 저장이 네이티브에 반영되기 전에 눌렀을 때 진동이 조용히 무시된다.
        // 햅틱 제너레이터만으로는 "진동" 체감이 안 돼서 실제 진동 모터를 울린다.
        // Capacitor 콜은 백그라운드 스레드라 UIKit 피드백은 반드시 메인에서.
        DispatchQueue.main.async {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.warning)
        }
        call.resolve(["ok": true])
    }

    @objc func setAlertMode(_ call: CAPPluginCall) {
        guard let mode = call.getString("mode") else {
            call.reject("mode required")
            return
        }
        if mode == "sound" || mode == "vibrate" || mode == "silent" {
            FutureMeAlarmStorage.saveAlertMode(mode)
        }
        call.resolve(["ok": true, "mode": FutureMeAlarmStorage.loadAlertMode()])
    }

    // MARK: - 내부

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    @MainActor
    private func deliverPendingDismissIfNeeded() {
        guard let pending = AlarmKitBridge.shared.pendingDismiss() else { return }
        notifyAlarmFired(pending)
    }
    #endif

    private func notifyAlarmFired(_ pending: FutureMePendingDismiss) {
        notifyListeners(
            "alarmFired",
            data: Self.pendingPayload(pending, includePendingFlag: false),
            retainUntilConsumed: true
        )
    }

    private static func pendingPayload(
        _ pending: FutureMePendingDismiss,
        includePendingFlag: Bool
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "alarmId": pending.alarmId,
            "label": pending.label,
            "time": pending.time,
            "phrase": pending.phrase,
            "dateKey": pending.dateKey,
            "alarmKitId": pending.kitId,
            "source": "alarmkit",
        ]
        if includePendingFlag { payload["pending"] = true }
        return payload
    }

    private func loadStoredAlarms() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: storageKey) as? [[String: Any]] ?? []
    }

    private static func notificationPermissionLabel(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "unknown"
        }
    }
}
