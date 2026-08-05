import Foundation
import UserNotifications

/// 알람 저장소 · 공용 상수
///
/// 설계 원칙 (v2)
/// - 한 번의 알람 발생마다 "울림 체인"을 통째로 미리 예약한다.
///   AlarmKit 알람 N개 + 푸시 N개를 20초 간격으로 한꺼번에 등록하므로,
///   앱이 강제 종료돼도 App Intent 실행 여부와 무관하게 재울림이 보장된다.
/// - 다짐 따라치기를 완료하면 그 체인의 남은 알람·푸시를 전부 취소한다.
/// - 앱이 열릴 때 체인이 짧아졌으면 다시 채운다(무한 반복).
public enum FutureMeAlarmStorage {
    public static let ringPlansKey = "futureme-alarm-ring-plans-v2"
    public static let pendingDismissKey = "futureme-alarm-pending-dismiss-v2"
    public static let alertModeKey = "futureme-alarm-alert-mode"
    public static let debugLogKey = "futureme-alarm-debug-log-v2"

    /// 재울림 간격
    public static let reRingIntervalSeconds = 20
    /// 알람 1건당 미리 예약하는 울림 횟수 (앱이 죽어 있어도 이만큼 보장 = 약 6분 40초)
    public static let ringChainCount = 20
    /// 남은 울림이 이 값보다 적어지면 체인을 다시 채운다
    public static let ringChainRefillThreshold = 8
    /// 전체 푸시 예약 상한 (iOS 대기 알림 64개 제한 대비)
    public static let pushBudget = 50
    /// 따라치기 대기 체인을 동기화로부터 보호하는 기간 (이후엔 다음 발생분으로 교체)
    public static let awaitingProtectionSeconds: TimeInterval = 7_200

    public static func saveAlertMode(_ mode: String) {
        UserDefaults.standard.set(mode, forKey: alertModeKey)
    }

    public static func loadAlertMode() -> String {
        UserDefaults.standard.string(forKey: alertModeKey) ?? "vibrate"
    }

    public static func pushUsesSound() -> Bool {
        loadAlertMode() == "sound"
    }

    public static func dateKey(for date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.string(from: date)
    }

    public static func todayDateKey() -> String {
        dateKey(for: Date())
    }

    // MARK: - 디버그 로그 (앱 UI 에서 확인용)

    public static func log(_ message: String) {
        let f = DateFormatter()
        f.dateFormat = "MM/dd HH:mm:ss"
        f.timeZone = .current
        var lines = UserDefaults.standard.stringArray(forKey: debugLogKey) ?? []
        lines.append("\(f.string(from: Date())) \(message)")
        if lines.count > 80 {
            lines.removeFirst(lines.count - 80)
        }
        UserDefaults.standard.set(lines, forKey: debugLogKey)
    }

    public static func readLog() -> [String] {
        UserDefaults.standard.stringArray(forKey: debugLogKey) ?? []
    }

    public static func clearLog() {
        UserDefaults.standard.removeObject(forKey: debugLogKey)
    }

    static func clockString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        f.timeZone = .current
        return f.string(from: date)
    }
}

/// AlarmKit 알람에 실려가는 정보 (잠금 화면 · Intent 에서 그대로 읽는다)
public struct FutureMeAlarmMetadata: Codable, Hashable, Sendable {
    public var alarmId: String
    public var phrase: String
    public var time: String
    public var label: String
    public var dateKey: String

    public init(alarmId: String, phrase: String, time: String, label: String, dateKey: String) {
        self.alarmId = alarmId
        self.phrase = phrase
        self.time = time
        self.label = label
        self.dateKey = dateKey
    }
}

/// 체인 안의 개별 울림 1회
public struct FutureMeRing: Codable, Sendable {
    public var kitId: String
    public var fireAt: TimeInterval
    public var pushId: String?

    public init(kitId: String, fireAt: TimeInterval, pushId: String?) {
        self.kitId = kitId
        self.fireAt = fireAt
        self.pushId = pushId
    }
}

/// 알람 1회 발생분 = 미리 예약된 울림 체인
public struct FutureMeRingPlan: Codable, Sendable {
    public var alarmId: String
    public var phrase: String
    public var time: String
    public var label: String
    public var dateKey: String
    public var firstFireAt: TimeInterval
    public var rings: [FutureMeRing]
    /// 다짐 따라치기 완료 여부 — true 면 남은 울림 전부 취소됨
    public var completed: Bool
    /// 5초 테스트로 만든 체인 (자동 동기화가 덮어쓰지 않도록)
    public var isTest: Bool
    public var createdAt: TimeInterval

    public init(
        alarmId: String,
        phrase: String,
        time: String,
        label: String,
        dateKey: String,
        firstFireAt: TimeInterval,
        rings: [FutureMeRing],
        completed: Bool = false,
        isTest: Bool = false,
        createdAt: TimeInterval = Date().timeIntervalSince1970
    ) {
        self.alarmId = alarmId
        self.phrase = phrase
        self.time = time
        self.label = label
        self.dateKey = dateKey
        self.firstFireAt = firstFireAt
        self.rings = rings
        self.completed = completed
        self.isTest = isTest
        self.createdAt = createdAt
    }

    public var metadata: FutureMeAlarmMetadata {
        FutureMeAlarmMetadata(
            alarmId: alarmId,
            phrase: phrase,
            time: time,
            label: label,
            dateKey: dateKey
        )
    }

    public var lastFireAt: TimeInterval {
        rings.map(\.fireAt).max() ?? firstFireAt
    }

    /// 첫 울림 시각이 지났는가 (= 사용자가 알람을 이미 겪었는가)
    public var hasStarted: Bool {
        Date().timeIntervalSince1970 >= firstFireAt - 1
    }

    /// 울리기 시작했고 아직 다짐을 안 친 상태 — 앱을 열면 따라치기를 보여준다
    public var isAwaitingPhrase: Bool {
        !completed && hasStarted
    }

    /// 동기화가 건드리면 안 되는 "진행 중" 체인.
    ///
    /// 방치된 체인을 영구히 보호하면 다음 날 알람이 예약되지 않으므로 보호 기간을 둔다.
    /// 이 기간이 지나면 동기화가 다음 발생분으로 교체하고, 따라치기는 앱을 열 때 한 번 더 안내된다.
    public var isProtectedFromSync: Bool {
        isAwaitingPhrase
            && Date().timeIntervalSince1970 - firstFireAt < FutureMeAlarmStorage.awaitingProtectionSeconds
    }

    public var kitIds: [String] { rings.map(\.kitId) }
    public var pushIds: [String] { rings.compactMap(\.pushId) }

    public func futureRingCount(now: TimeInterval = Date().timeIntervalSince1970) -> Int {
        rings.filter { $0.fireAt > now + 1 }.count
    }
}

/// 알람별 울림 체인 저장소
public enum FutureMeRingPlanStore {
    public static func loadAll() -> [String: FutureMeRingPlan] {
        guard let data = UserDefaults.standard.data(forKey: FutureMeAlarmStorage.ringPlansKey),
              let map = try? JSONDecoder().decode([String: FutureMeRingPlan].self, from: data) else {
            return [:]
        }
        return map
    }

    public static func saveAll(_ map: [String: FutureMeRingPlan]) {
        guard let data = try? JSONEncoder().encode(map) else { return }
        UserDefaults.standard.set(data, forKey: FutureMeAlarmStorage.ringPlansKey)
    }

    public static func save(_ plan: FutureMeRingPlan) {
        var map = loadAll()
        map[plan.alarmId] = plan
        saveAll(map)
    }

    public static func plan(for alarmId: String) -> FutureMeRingPlan? {
        loadAll()[alarmId]
    }

    public static func plan(containingKitId kitId: String) -> FutureMeRingPlan? {
        for plan in loadAll().values where plan.kitIds.contains(kitId) {
            return plan
        }
        return nil
    }

    public static func remove(alarmId: String) {
        var map = loadAll()
        map.removeValue(forKey: alarmId)
        saveAll(map)
    }

    public static func removeAll() {
        UserDefaults.standard.removeObject(forKey: FutureMeAlarmStorage.ringPlansKey)
    }

    /// 따라치기를 기다리는 체인 (가장 최근 울림 기준)
    public static func firstAwaitingPhrasePlan() -> FutureMeRingPlan? {
        loadAll()
            .values
            .filter { $0.isAwaitingPhrase }
            .sorted { $0.firstFireAt > $1.firstFireAt }
            .first
    }

    public static func hasAwaitingPhrasePlan() -> Bool {
        firstAwaitingPhrasePlan() != nil
    }

    /// 오래된 체인 정리 — 완료됐거나 마지막 울림이 한참 지난 것
    public static func prune() {
        let now = Date().timeIntervalSince1970
        var map = loadAll()
        var changed = false
        for (alarmId, plan) in map {
            let staleCompleted = plan.completed && now - plan.createdAt > 3_600
            let staleExpired = now - plan.lastFireAt > 21_600
            if staleCompleted || staleExpired {
                map.removeValue(forKey: alarmId)
                changed = true
            }
        }
        if changed { saveAll(map) }
    }
}

/// 앱이 열렸을 때 따라치기 화면에 넘길 정보
public struct FutureMePendingDismiss: Codable, Sendable {
    public var alarmId: String
    public var phrase: String
    public var time: String
    public var label: String
    public var dateKey: String
    public var kitId: String

    public init(plan: FutureMeRingPlan, kitId: String) {
        self.alarmId = plan.alarmId
        self.phrase = plan.phrase
        self.time = plan.time
        self.label = plan.label
        self.dateKey = plan.dateKey
        self.kitId = kitId
    }
}

public enum FutureMePendingDismissStore {
    public static func save(_ pending: FutureMePendingDismiss) {
        guard let data = try? JSONEncoder().encode(pending) else { return }
        UserDefaults.standard.set(data, forKey: FutureMeAlarmStorage.pendingDismissKey)
    }

    public static func load() -> FutureMePendingDismiss? {
        guard let data = UserDefaults.standard.data(forKey: FutureMeAlarmStorage.pendingDismissKey),
              let pending = try? JSONDecoder().decode(FutureMePendingDismiss.self, from: data) else {
            return nil
        }
        return pending
    }

    public static func clear() {
        UserDefaults.standard.removeObject(forKey: FutureMeAlarmStorage.pendingDismissKey)
    }
}

/// AlarmKit 없이도 AppDelegate · 플러그인에서 쓸 수 있는 알림 헬퍼
public enum FutureMeAlarmNotificationBridge {
    /// 푸시를 탭해서 앱이 열린 경우 — 해당 알람 체인을 따라치기 대기로 표시
    public static func stageOpenDismissFromNotification(_ userInfo: [AnyHashable: Any]) {
        guard userInfo["futuremeAlarm"] as? Bool == true else { return }
        guard let alarmId = userInfo["alarmId"] as? String else { return }
        guard let plan = FutureMeRingPlanStore.plan(for: alarmId), !plan.completed else { return }
        let kitId = userInfo["kitId"] as? String ?? plan.kitIds.first ?? ""
        FutureMePendingDismissStore.save(FutureMePendingDismiss(plan: plan, kitId: kitId))
        FutureMeAlarmStorage.log("push-tap alarm=\(alarmId)")
    }

    public static func cancelAllFutureMePushes() {
        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            let ids = requests.map(\.identifier).filter { $0.hasPrefix("futureme-") }
            guard !ids.isEmpty else { return }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    public static func cancel(ids: [String]) {
        guard !ids.isEmpty else { return }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// 알람 울림과 동시에 오는 푸시 — 탭하면 따라치기 화면
    @discardableResult
    public static func schedulePush(
        metadata: FutureMeAlarmMetadata,
        kitId: String,
        fireAt: Date,
        identifier: String
    ) -> String? {
        let seconds = fireAt.timeIntervalSinceNow
        guard seconds > 0.5 else { return nil }

        let content = UNMutableNotificationContent()
        content.title = metadata.label
        content.body = "다짐을 따라 쳐야 알람이 꺼져요 — Future Me 앱을 열어주세요"
        if FutureMeAlarmStorage.pushUsesSound() {
            content.sound = .default
        }
        content.interruptionLevel = .timeSensitive
        content.userInfo = [
            "futuremeAlarm": true,
            "alarmId": metadata.alarmId,
            "phrase": metadata.phrase,
            "time": metadata.time,
            "label": metadata.label,
            "dateKey": metadata.dateKey,
            "kitId": kitId,
        ]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
        return identifier
    }
}

#if canImport(AlarmKit)
import AlarmKit
import AppIntents

extension FutureMeAlarmMetadata: AlarmMetadata {}

/// 잠금 화면 App Intent 진입점.
/// 재울림은 이미 예약돼 있으므로 여기서 실패해도 반복은 계속된다 (여기서는 보조 작업만).
@available(iOS 26.0, *)
public enum FutureMeAlarmKitActions {
    /// 「따라치기」 버튼 — 앱을 열고 따라치기 화면
    @MainActor
    public static func stageOpenDismiss(alarmKitId: String) {
        FutureMeAlarmStorage.log("intent-open kit=\(alarmKitId.prefix(8))")
        stagePending(alarmKitId: alarmKitId)
    }

    /// 스와이프로 끔 — 따라치기 대기 표시 + 체인 보충
    @MainActor
    public static func handleSwipeStop(alarmKitId: String) async {
        FutureMeAlarmStorage.log("intent-stop kit=\(alarmKitId.prefix(8))")
        stagePending(alarmKitId: alarmKitId)
        await AlarmKitBridge.shared.refillAwaitingPlans()
    }

    @MainActor
    private static func stagePending(alarmKitId: String) {
        guard let plan = FutureMeRingPlanStore.plan(containingKitId: alarmKitId) else {
            FutureMeAlarmStorage.log("intent-no-plan kit=\(alarmKitId.prefix(8))")
            return
        }
        guard !plan.completed else { return }
        FutureMePendingDismissStore.save(FutureMePendingDismiss(plan: plan, kitId: alarmKitId))
    }
}
#endif
