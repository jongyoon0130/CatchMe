import Foundation
import Capacitor
import UserNotifications

/// AlarmKit entitlement 전 mock 모드.
/// - syncAlarms: UserDefaults에 저장
/// - simulateAlarm: JS로 alarmFired 이벤트 + (선택) 로컬 알림
/// entitlement 승인 후 `#if canImport(AlarmKit)` 블록에서 AlarmManager 연동
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
    ]

    private let storageKey = "futureme-native-alarms-json"
    /// entitlement 승인 후 true — AlarmKit 스케줄링으로 전환
    private let useAlarmKit = false

    @objc func getStatus(_ call: CAPPluginCall) {
        let count = loadStoredAlarms().count
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                permission = "granted"
            case .denied:
                permission = "denied"
            case .notDetermined:
                permission = "prompt"
            @unknown default:
                permission = "unknown"
            }

            call.resolve([
                "platform": "ios",
                "mode": self.useAlarmKit ? "alarmkit" : "mock",
                "alarmKitEntitled": self.useAlarmKit,
                "notificationPermission": permission,
                "scheduledCount": count,
                "message": self.useAlarmKit
                    ? "AlarmKit 활성 — 시스템 알람으로 스케줄됨"
                    : "Mock 모드 — AlarmKit entitlement 승인 전. 시뮬레이션·로컬 알림으로 테스트",
            ])
        }
    }

    @objc func syncAlarms(_ call: CAPPluginCall) {
        guard let alarms = call.getArray("alarms") else {
            call.reject("alarms array required")
            return
        }
        UserDefaults.standard.set(alarms, forKey: storageKey)
        if useAlarmKit {
            // TODO(entitlement): AlarmManager.shared.schedule(...) for each enabled alarm
        } else {
            scheduleLocalAlarmNotifications(alarms: alarms)
        }
        call.resolve(["ok": true, "count": alarms.count, "mode": useAlarmKit ? "alarmkit" : "mock"])
    }

    @objc func simulateAlarm(_ call: CAPPluginCall) {
        let alarmId = call.getString("alarmId") ?? ""
        let label = call.getString("label") ?? "알람"
        let time = call.getString("time") ?? "07:00"
        let phrase = call.getString("phrase") ?? "안녕"

        notifyAlarmFired(alarmId: alarmId, label: label, time: time, phrase: phrase)
        call.resolve(["ok": true])
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["permission": granted ? "granted" : "denied"])
        }
    }

    /// 약한 대용 — N초 뒤 로컬 알림 (AlarmKit 아님)
    @objc func scheduleTestNotification(_ call: CAPPluginCall) {
        let seconds = call.getInt("seconds") ?? 5
        let label = call.getString("label") ?? "Future Me 테스트"
        let phrase = call.getString("phrase") ?? "안녕"

        let content = UNMutableNotificationContent()
        content.title = label
        content.body = "탭하면 따라치기 — \(phrase)"
        content.sound = .default
        content.userInfo = [
            "futuremeAlarm": true,
            "alarmId": call.getString("alarmId") ?? "test",
            "phrase": phrase,
            "time": call.getString("time") ?? "07:00",
            "label": label,
        ]

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, seconds)), repeats: false)
        let request = UNNotificationRequest(identifier: "futureme-test-\(UUID().uuidString)", content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                call.reject("notification failed: \(error.localizedDescription)")
            } else {
                call.resolve(["ok": true, "seconds": seconds])
            }
        }
    }

    private func loadStoredAlarms() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: storageKey) as? [[String: Any]] ?? []
    }

    /// AlarmKit 전 — UNCalendarNotificationTrigger 로 앱 꺼져도 정각 알림 (시계앱급은 아님)
    private func scheduleLocalAlarmNotifications(alarms: [Any]) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let stale = pending
                .map(\.identifier)
                .filter { $0.hasPrefix("futureme-alarm-") }
            center.removePendingNotificationRequests(withIdentifiers: stale)

            for raw in alarms {
                guard let alarm = raw as? [String: Any] else { continue }
                if (alarm["enabled"] as? Bool) == false { continue }
                guard let alarmId = alarm["id"] as? String,
                      let time = alarm["time"] as? String else { continue }

                let parts = time.split(separator: ":")
                guard parts.count == 2,
                      let hour = Int(parts[0]),
                      let minute = Int(parts[1]) else { continue }

                let label = alarm["label"] as? String ?? "알람"
                let repeatDays = alarm["repeatDays"] as? [Int] ?? [0, 1, 2, 3, 4, 5, 6]

                for dow in repeatDays {
                    var dc = DateComponents()
                    dc.hour = hour
                    dc.minute = minute
                    dc.weekday = dow + 1 // 1=일 … 7=토

                    let content = UNMutableNotificationContent()
                    content.title = label
                    content.body = "다짐을 따라 쳐야 꺼져요 — Future Me"
                    content.sound = .default
                    content.userInfo = [
                        "futuremeAlarm": true,
                        "alarmId": alarmId,
                        "label": label,
                        "time": time,
                        "phrase": "안녕",
                    ]

                    let trigger = UNCalendarNotificationTrigger(dateMatching: dc, repeats: true)
                    let id = "futureme-alarm-\(alarmId)-\(dow)"
                    let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
                    center.add(request)
                }
            }
        }
    }

    private func notifyAlarmFired(alarmId: String, label: String, time: String, phrase: String) {
        let payload: [String: Any] = [
            "alarmId": alarmId,
            "label": label,
            "time": time,
            "phrase": phrase,
            "dateKey": todayDateKey(),
            "source": useAlarmKit ? "alarmkit" : "mock",
        ]
        notifyListeners("alarmFired", data: payload)
    }

    private func todayDateKey() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.string(from: Date())
    }
}
