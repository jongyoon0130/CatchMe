#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
import AppIntents
import Foundation
import SwiftUI
import UIKit
import UserNotifications

/// AlarmKit 래퍼 (v2)
///
/// 알람 1회 발생 = 20초 간격 울림 체인 N개를 **한 번에 미리 예약**.
/// 앱이 강제 종료돼 App Intent 가 실행되지 않아도 재울림이 계속된다.
/// 다짐 따라치기를 완료하면 남은 체인을 전부 취소한다.
@available(iOS 26.0, *)
@MainActor
public final class AlarmKitBridge {
    typealias AlarmConfig = AlarmManager.AlarmConfiguration<FutureMeAlarmMetadata>
    public static let shared = AlarmKitBridge()

    private let manager = AlarmManager.shared
    private var onAlert: ((FutureMePendingDismiss) -> Void)?
    private var observeTask: Task<Void, Never>?
    private var seenAlerting = Set<UUID>()
    private var lastAlerting = Set<UUID>()

    private init() {}

    public static var isAvailable: Bool { true }

    /// `AlarmManager.alarms` 는 throwing property — 실패 시 빈 배열
    private var scheduledAlarms: [Alarm] {
        (try? manager.alarms) ?? []
    }

    /// 예약/취소가 겹쳐서 서로의 체인을 지우지 않도록 직렬 실행
    private var mutationTail: Task<Void, Never> = Task {}

    private func serialized<T>(_ work: @escaping () async throws -> T) async throws -> T {
        let previous = mutationTail
        let task = Task<T, Error> { @MainActor in
            await previous.value
            return try await work()
        }
        mutationTail = Task { _ = try? await task.value }
        return try await task.value
    }

    nonisolated(unsafe) private static var makeOpenDismissIntent: ((String) -> any LiveActivityIntent)?
    nonisolated(unsafe) private static var makeStopCaptureIntent: ((String) -> any LiveActivityIntent)?

    public nonisolated static func registerIntentFactories(
        open: @escaping (String) -> any LiveActivityIntent,
        stop: @escaping (String) -> any LiveActivityIntent
    ) {
        makeOpenDismissIntent = open
        makeStopCaptureIntent = stop
    }

    func setAlertHandler(_ handler: @escaping (FutureMePendingDismiss) -> Void) {
        onAlert = handler
    }

    // MARK: - 권한

    func authorizationLabel() -> String {
        switch manager.authorizationState {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "unknown"
        }
    }

    func requestAuthorization() async throws -> String {
        let state = try await manager.requestAuthorization()
        switch state {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "unknown"
        }
    }

    private func ensureAuthorized() async throws {
        if manager.authorizationState == .notDetermined {
            _ = try? await manager.requestAuthorization()
        }
        guard manager.authorizationState == .authorized else {
            throw AlarmKitBridgeError.notAuthorized
        }
    }

    private func ensureNotificationPermission() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
    }

    // MARK: - 알람 관찰

    func startObserving() {
        observeTask?.cancel()
        observeTask = Task { [weak self] in
            guard let self else { return }
            self.lastAlerting = Set(
                self.scheduledAlarms.filter { $0.state == .alerting }.map(\.id)
            )
            for await alarms in self.manager.alarmUpdates {
                self.handleAlarmUpdates(alarms)
            }
        }
    }

    private func handleAlarmUpdates(_ alarms: [Alarm]) {
        let alerting = Set(alarms.filter { $0.state == .alerting }.map(\.id))

        for id in alerting where !seenAlerting.contains(id) {
            seenAlerting.insert(id)
            guard let plan = FutureMeRingPlanStore.plan(containingKitId: id.uuidString) else { continue }
            if plan.completed {
                try? manager.stop(id: id)
                try? manager.cancel(id: id)
                continue
            }
            let pending = FutureMePendingDismiss(plan: plan, kitId: id.uuidString)
            FutureMePendingDismissStore.save(pending)

            // 앱을 보고 있는 동안엔 전체화면 알람이 다짐 입력을 가로막는다.
            // 이번 울림만 내려주고 체인은 그대로 둔다 — 앱을 나가면 다음 울림이 정상 동작.
            if UIApplication.shared.applicationState == .active {
                try? manager.stop(id: id)
                FutureMeAlarmStorage.log("포그라운드 — 이번 울림만 내림 alarm=\(shortId(plan.alarmId))")
            } else {
                FutureMeAlarmStorage.log("울림 alarm=\(shortId(plan.alarmId)) kit=\(id.uuidString.prefix(8))")
            }
            onAlert?(pending)
        }

        let stopped = lastAlerting.subtracting(alerting)
        if !stopped.isEmpty {
            FutureMeAlarmStorage.log("stopped x\(stopped.count) — 체인 보충 확인")
            Task { await self.refillAwaitingPlans() }
        }

        lastAlerting = alerting
        seenAlerting = seenAlerting.intersection(alerting)
    }

    // MARK: - 실제 알람 동기화

    /// 사용자 알람 목록 → 울림 체인 예약.
    /// 따라치기 대기 중인 체인은 절대 취소하지 않는다.
    func syncAlarms(_ raw: [Any]) async throws -> Int {
        try await serialized { [weak self] in
            guard let self else { return 0 }
            return try await self.performSync(raw)
        }
    }

    private func performSync(_ raw: [Any]) async throws -> Int {
        try await ensureAuthorized()
        await ensureNotificationPermission()
        FutureMeRingPlanStore.prune()

        var pushBudget = FutureMeAlarmStorage.pushBudget
        var seenIds = Set<String>()
        var scheduled = 0
        var toGrow: [String] = []
        var awaitingToRefill: [FutureMeRingPlan] = []

        for item in raw {
            guard let dict = item as? [String: Any],
                  let alarmId = dict["id"] as? String else { continue }
            seenIds.insert(alarmId)

            let existing = FutureMeRingPlanStore.plan(for: alarmId)

            guard Self.isEnabled(dict) else {
                if existing?.isProtectedFromSync != true {
                    await cancelPlan(alarmId: alarmId)
                }
                continue
            }

            guard let time = dict["time"] as? String,
                  let (hour, minute) = Self.parseTime(time) else { continue }

            let label = (dict["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let resolvedLabel = (label?.isEmpty == false ? label! : "알람")
            let phrase = (dict["phrase"] as? String) ?? "안녕"
            let repeatDays = Self.parseRepeatDays(dict)

            // 1) 따라치기 대기 중 — 손대지 않는다. 체인 보충은 아래에서 (슬롯 우선순위 최상)
            if let existing, existing.isProtectedFromSync {
                FutureMeAlarmStorage.log("sync-keep-awaiting alarm=\(shortId(alarmId))")
                awaitingToRefill.append(existing)
                scheduled += 1
                continue
            }

            // 2) 5초 테스트 체인이 아직 살아 있으면 유지
            if let existing, existing.isTest, !existing.completed,
               existing.lastFireAt > Date().timeIntervalSince1970 {
                FutureMeAlarmStorage.log("sync-keep-test alarm=\(shortId(alarmId))")
                scheduled += 1
                continue
            }

            guard let nextFire = Self.nextFireDate(hour: hour, minute: minute, repeatDays: repeatDays) else {
                continue
            }

            // 3) 같은 시각으로 이미 예약돼 있고 AlarmKit 에 살아 있으면 그대로 둔다
            if let existing,
               !existing.completed,
               !existing.isTest,
               abs(existing.firstFireAt - nextFire.timeIntervalSince1970) < 1,
               existing.phrase == phrase,
               existing.label == resolvedLabel,
               existing.futureRingCount() >= FutureMeAlarmStorage.ringChainRefillThreshold,
               let firstKit = existing.rings.first?.kitId,
               isKitScheduled(firstKit) {
                pushBudget = max(0, pushBudget - existing.pushIds.count)
                scheduled += 1
                continue
            }

            // 4) 첫 울림 예약 (재울림은 아래 라운드로빈에서)
            await cancelPlan(alarmId: alarmId)
            let ok = await beginPlan(
                alarmId: alarmId,
                phrase: phrase,
                time: time,
                label: resolvedLabel,
                firstFire: nextFire,
                isTest: false,
                pushBudget: &pushBudget
            )
            if ok {
                scheduled += 1
                toGrow.append(alarmId)
            }
        }

        // 목록에서 사라진 알람 정리 — 슬롯을 먼저 비운다
        for (alarmId, plan) in FutureMeRingPlanStore.loadAll() where !seenIds.contains(alarmId) {
            if plan.isProtectedFromSync { continue }
            await cancelPlan(alarmId: alarmId)
        }

        // 지금 울리고 있는(따라치기 대기) 체인에 슬롯을 먼저 준다
        for plan in awaitingToRefill {
            await refill(plan: plan, pushBudget: &pushBudget)
        }
        await growChains(
            alarmIds: toGrow,
            targetRings: FutureMeAlarmStorage.ringChainCount,
            pushBudget: &pushBudget
        )

        FutureMeAlarmStorage.log("sync 완료 — \(scheduled)개 알람 예약")
        return scheduled
    }

    // MARK: - 5초 테스트 (실제 알람과 동일 경로)

    struct ScheduleTestResult: Sendable {
        let ringCount: Int
        let pushCount: Int
        let intentsAttached: Bool
    }

    @discardableResult
    func scheduleFixedTest(
        seconds: Int,
        alarmId: String,
        label: String,
        time: String,
        phrase: String
    ) async throws -> ScheduleTestResult {
        try await serialized { [weak self] in
            guard let self else { throw AlarmKitBridgeError.unavailable }
            return try await self.performFixedTest(
                seconds: seconds,
                alarmId: alarmId,
                label: label,
                time: time,
                phrase: phrase
            )
        }
    }

    private func performFixedTest(
        seconds: Int,
        alarmId: String,
        label: String,
        time: String,
        phrase: String
    ) async throws -> ScheduleTestResult {
        try await ensureAuthorized()
        await ensureNotificationPermission()

        await cancelPlan(alarmId: alarmId)

        var pushBudget = FutureMeAlarmStorage.pushBudget
        let firstFire = Date().addingTimeInterval(TimeInterval(max(1, seconds)))
        let ok = await beginPlan(
            alarmId: alarmId,
            phrase: phrase,
            time: time,
            label: label,
            firstFire: firstFire,
            isTest: true,
            pushBudget: &pushBudget
        )
        guard ok else { throw AlarmKitBridgeError.scheduleFailed }

        await growChains(
            alarmIds: [alarmId],
            targetRings: FutureMeAlarmStorage.ringChainCount,
            pushBudget: &pushBudget
        )
        guard let plan = FutureMeRingPlanStore.plan(for: alarmId) else {
            throw AlarmKitBridgeError.scheduleFailed
        }
        return ScheduleTestResult(
            ringCount: plan.rings.count,
            pushCount: plan.pushIds.count,
            intentsAttached: Self.openDismissIntent(for: UUID()) != nil
        )
    }

    // MARK: - 체인 예약 · 보충 · 취소

    /// 첫 울림만 예약하고 체인을 만든다.
    ///
    /// AlarmKit 은 앱당 알람 개수에 상한이 있어 `maximumLimitReached` 를 던진다.
    /// 알람이 여러 개일 때 첫 알람이 슬롯을 다 먹지 않도록 "첫 울림 → 이후 라운드로빈" 으로 나눈다.
    private func beginPlan(
        alarmId: String,
        phrase: String,
        time: String,
        label: String,
        firstFire: Date,
        isTest: Bool,
        pushBudget: inout Int
    ) async -> Bool {
        let metadata = FutureMeAlarmMetadata(
            alarmId: alarmId,
            phrase: phrase,
            time: time,
            label: label,
            dateKey: FutureMeAlarmStorage.dateKey(for: firstFire)
        )
        guard let ring = await scheduleRing(
            metadata: metadata,
            fireAt: firstFire,
            isFirst: true,
            pushBudget: &pushBudget
        ) else {
            FutureMeAlarmStorage.log("첫 울림 예약 실패 alarm=\(shortId(alarmId))")
            return false
        }

        FutureMeRingPlanStore.save(
            FutureMeRingPlan(
                alarmId: alarmId,
                phrase: phrase,
                time: time,
                label: label,
                dateKey: metadata.dateKey,
                firstFireAt: firstFire.timeIntervalSince1970,
                rings: [ring],
                completed: false,
                isTest: isTest
            )
        )
        FutureMeAlarmStorage.log(
            "예약 alarm=\(shortId(alarmId)) 첫울림=\(FutureMeAlarmStorage.clockString(firstFire)) test=\(isTest)"
        )
        return true
    }

    /// 체인 끝에 재울림 1회 추가
    private func appendRing(alarmId: String, pushBudget: inout Int) async -> Bool {
        guard let plan = FutureMeRingPlanStore.plan(for: alarmId), !plan.completed else { return false }
        let interval = Double(FutureMeAlarmStorage.reRingIntervalSeconds)
        let nextAt = max(plan.lastFireAt, Date().timeIntervalSince1970) + interval

        guard let ring = await scheduleRing(
            metadata: plan.metadata,
            fireAt: Date(timeIntervalSince1970: nextAt),
            isFirst: false,
            pushBudget: &pushBudget
        ) else { return false }

        // 예약 도중 다짐이 완료됐다면 방금 만든 울림을 되돌린다
        guard var fresh = FutureMeRingPlanStore.plan(for: alarmId), !fresh.completed else {
            cancelRings([ring.kitId])
            FutureMeAlarmNotificationBridge.cancel(ids: [ring.pushId].compactMap { $0 })
            return false
        }
        fresh.rings.append(ring)
        FutureMeRingPlanStore.save(fresh)
        return true
    }

    /// 여러 체인을 번갈아 늘린다 — 어느 알람도 재울림이 0회가 되지 않게
    private func growChains(
        alarmIds: [String],
        targetRings: Int,
        pushBudget: inout Int
    ) async {
        guard !alarmIds.isEmpty else { return }
        var active = alarmIds
        var round = 1
        while round < targetRings, !active.isEmpty {
            var next: [String] = []
            for alarmId in active {
                if await appendRing(alarmId: alarmId, pushBudget: &pushBudget) {
                    next.append(alarmId)
                }
            }
            active = next
            round += 1
        }
    }

    /// 울림 1회 = AlarmKit 알람 + 동시 푸시
    private func scheduleRing(
        metadata: FutureMeAlarmMetadata,
        fireAt: Date,
        isFirst: Bool,
        pushBudget: inout Int
    ) async -> FutureMeRing? {
        let kitId = UUID()
        let title = isFirst ? metadata.label : "\(metadata.label) — 다시 울림"
        let attributes = AlarmAttributes(
            presentation: AlarmPresentation(alert: Self.makeAlert(title: title)),
            metadata: metadata,
            tintColor: Color(red: 0.12, green: 0.11, blue: 0.20)
        )
        // 커스텀(무음) 사운드가 해석되지 않아 예약이 실패하는 일이 없도록 기본음까지 순차 시도.
        // 소리보다 "알람이 울리는 것" 이 우선이다.
        var scheduled = false
        for sound in Self.soundCandidates() {
            let configuration = AlarmConfig.alarm(
                schedule: .fixed(fireAt),
                attributes: attributes,
                stopIntent: Self.stopCaptureIntent(for: kitId),
                secondaryIntent: Self.openDismissIntent(for: kitId),
                sound: sound
            )
            do {
                _ = try await manager.schedule(id: kitId, configuration: configuration)
                scheduled = true
                break
            } catch AlarmManager.AlarmError.maximumLimitReached {
                // 슬롯이 꽉 찼다 — 사운드를 바꿔도 안 되므로 즉시 중단
                FutureMeAlarmStorage.log("AlarmKit 슬롯 한도 도달 — 여기서 체인 중단")
                return nil
            } catch {
                FutureMeAlarmStorage.log("AlarmKit 예약 실패: \(error.localizedDescription)")
            }
        }
        guard scheduled else { return nil }

        var pushId: String?
        if pushBudget > 0 {
            pushId = FutureMeAlarmNotificationBridge.schedulePush(
                metadata: metadata,
                kitId: kitId.uuidString,
                fireAt: fireAt,
                identifier: "futureme-ring-\(kitId.uuidString)"
            )
            if pushId != nil { pushBudget -= 1 }
        }

        return FutureMeRing(
            kitId: kitId.uuidString,
            fireAt: fireAt.timeIntervalSince1970,
            pushId: pushId
        )
    }

    /// 따라치기 대기 중인 체인들의 남은 울림을 다시 채운다 (무한 반복 보장)
    func refillAwaitingPlans() async {
        try? await serialized { [weak self] in
            guard let self else { return }
            var pushBudget = FutureMeAlarmStorage.pushBudget
            for plan in FutureMeRingPlanStore.loadAll().values where plan.isProtectedFromSync {
                await self.refill(plan: plan, pushBudget: &pushBudget)
            }
        }
    }

    private func refill(plan: FutureMeRingPlan, pushBudget: inout Int) async {
        let now = Date().timeIntervalSince1970
        // 이미 지난 울림 정리 (배열 무한 증가 방지)
        var pruned = plan
        pruned.rings = pruned.rings.filter { $0.fireAt > now - 600 }
        if pruned.rings.count != plan.rings.count {
            FutureMeRingPlanStore.save(pruned)
        }

        let remaining = pruned.futureRingCount(now: now)
        guard remaining < FutureMeAlarmStorage.ringChainRefillThreshold else { return }

        var added = 0
        for _ in 0..<(FutureMeAlarmStorage.ringChainCount - remaining) {
            guard await appendRing(alarmId: plan.alarmId, pushBudget: &pushBudget) else { break }
            added += 1
        }
        if added > 0 {
            FutureMeAlarmStorage.log("체인 보충 alarm=\(shortId(plan.alarmId)) +\(added)회")
        }
    }

    private func cancelPlan(alarmId: String) async {
        guard let plan = FutureMeRingPlanStore.plan(for: alarmId) else { return }
        cancelRings(plan.kitIds)
        FutureMeAlarmNotificationBridge.cancel(ids: plan.pushIds)
        FutureMeRingPlanStore.remove(alarmId: alarmId)
        if let pending = FutureMePendingDismissStore.load(), pending.alarmId == alarmId {
            FutureMePendingDismissStore.clear()
        }
    }

    private func cancelRings(_ kitIds: [String]) {
        for idStr in kitIds {
            guard let id = UUID(uuidString: idStr) else { continue }
            try? manager.stop(id: id)
            try? manager.cancel(id: id)
            seenAlerting.remove(id)
            lastAlerting.remove(id)
        }
    }

    func isKitScheduled(_ kitIdStr: String) -> Bool {
        guard let id = UUID(uuidString: kitIdStr) else { return false }
        return scheduledAlarms.contains { $0.id == id }
    }

    // MARK: - 따라치기 완료 / pending

    /// 다짐 완료 — 이 알람의 남은 울림·푸시 전부 취소
    func completePlan(alarmId: String?, kitId: String?) async {
        try? await serialized { [weak self] in
            self?.performCompletePlan(alarmId: alarmId, kitId: kitId)
        }
    }

    private func performCompletePlan(alarmId: String?, kitId: String?) {
        var target: FutureMeRingPlan?
        if let alarmId { target = FutureMeRingPlanStore.plan(for: alarmId) }
        if target == nil, let kitId { target = FutureMeRingPlanStore.plan(containingKitId: kitId) }
        if target == nil { target = FutureMeRingPlanStore.firstAwaitingPhrasePlan() }

        guard var plan = target else {
            FutureMePendingDismissStore.clear()
            FutureMeAlarmStorage.log("완료 처리할 체인 없음")
            return
        }

        cancelRings(plan.kitIds)
        FutureMeAlarmNotificationBridge.cancel(ids: plan.pushIds)
        plan.completed = true
        plan.rings = []
        FutureMeRingPlanStore.save(plan)
        FutureMePendingDismissStore.clear()
        FutureMeAlarmStorage.log("다짐 완료 — alarm=\(shortId(plan.alarmId)) 알람 정지")
    }

    /// 앱이 열렸을 때 따라치기 대상 조회.
    /// App Intent 실행 여부와 무관하게, 울리기 시작한 미완료 체인이 있으면 무조건 반환한다.
    func pendingDismiss() -> FutureMePendingDismiss? {
        if let pending = FutureMePendingDismissStore.load() {
            if let plan = FutureMeRingPlanStore.plan(for: pending.alarmId) {
                if plan.completed {
                    FutureMePendingDismissStore.clear()
                } else {
                    return pending
                }
            } else {
                FutureMePendingDismissStore.clear()
            }
        }

        guard let plan = FutureMeRingPlanStore.firstAwaitingPhrasePlan() else { return nil }
        let kitId = plan.rings.first?.kitId ?? ""
        let pending = FutureMePendingDismiss(plan: plan, kitId: kitId)
        FutureMePendingDismissStore.save(pending)
        FutureMeAlarmStorage.log("따라치기 복원 alarm=\(shortId(plan.alarmId))")
        return pending
    }

    /// 예약된 모든 것 삭제 (초기화 버튼)
    func cancelEverything() async {
        try? await serialized { [weak self] in
            self?.performCancelEverything()
        }
    }

    private func performCancelEverything() {
        for plan in FutureMeRingPlanStore.loadAll().values {
            cancelRings(plan.kitIds)
        }
        // AlarmKit 에 남아 있을 수 있는 잔여 알람까지 정리
        for alarm in scheduledAlarms {
            try? manager.stop(id: alarm.id)
            try? manager.cancel(id: alarm.id)
        }
        FutureMeAlarmNotificationBridge.cancelAllFutureMePushes()
        FutureMeRingPlanStore.removeAll()
        FutureMePendingDismissStore.clear()
        seenAlerting.removeAll()
        lastAlerting.removeAll()
        FutureMeAlarmStorage.log("전체 초기화")
    }

    // MARK: - 상태 조회

    func hasAwaitingPhrasePlan() -> Bool {
        FutureMeRingPlanStore.hasAwaitingPhrasePlan()
    }

    func planSummaries() -> [[String: Any]] {
        let now = Date().timeIntervalSince1970
        return FutureMeRingPlanStore.loadAll().values
            .sorted { $0.firstFireAt < $1.firstFireAt }
            .map { plan in
                [
                    "alarmId": plan.alarmId,
                    "label": plan.label,
                    "time": plan.time,
                    "firstFireAt": FutureMeAlarmStorage.clockString(
                        Date(timeIntervalSince1970: plan.firstFireAt)
                    ),
                    "ringsTotal": plan.rings.count,
                    "ringsRemaining": plan.futureRingCount(now: now),
                    "liveInAlarmKit": plan.rings.filter { isKitScheduled($0.kitId) }.count,
                    "completed": plan.completed,
                    "awaitingPhrase": plan.isAwaitingPhrase,
                    "isTest": plan.isTest,
                ]
            }
    }

    func alarmKitScheduledCount() -> Int {
        scheduledAlarms.count
    }

    // MARK: - 프레젠테이션

    /// 앞에서부터 시도 — 마지막은 항상 기본음(예약 자체가 실패하지 않도록)
    private static func soundCandidates() -> [AlertConfiguration.AlertSound] {
        if FutureMeAlarmStorage.pushUsesSound() {
            return [.default]
        }
        return [.named("futureme_silent.caf"), .named("futureme_silent"), .default]
    }

    private static func makeAlert(title: String) -> AlarmPresentation.Alert {
        let typeButton = AlarmButton(
            text: "따라치기",
            textColor: .white,
            systemImageName: "keyboard"
        )
        if #available(iOS 26.1, *) {
            return AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: title),
                secondaryButton: typeButton,
                secondaryButtonBehavior: .custom
            )
        }
        return AlarmPresentation.Alert(
            title: LocalizedStringResource(stringLiteral: title),
            stopButton: typeButton
        )
    }

    private static func openDismissIntent(for id: UUID) -> (any LiveActivityIntent)? {
        makeOpenDismissIntent?(id.uuidString)
    }

    private static func stopCaptureIntent(for id: UUID) -> (any LiveActivityIntent)? {
        makeStopCaptureIntent?(id.uuidString)
    }

    // MARK: - 파싱 유틸

    private static func isEnabled(_ dict: [String: Any]) -> Bool {
        if let value = dict["enabled"] as? Bool { return value }
        if let value = dict["enabled"] as? NSNumber { return value.boolValue }
        return true
    }

    private static func parseTime(_ time: String) -> (Int, Int)? {
        let parts = time.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]), (0...23).contains(hour),
              let minute = Int(parts[1]), (0...59).contains(minute) else { return nil }
        return (hour, minute)
    }

    private static func parseRepeatDays(_ dict: [String: Any]) -> [Int] {
        if let days = dict["repeatDays"] as? [Int], !days.isEmpty { return days }
        if let days = dict["repeatDays"] as? [NSNumber], !days.isEmpty { return days.map(\.intValue) }
        return [0, 1, 2, 3, 4, 5, 6]
    }

    /// 다음 울림 시각 — 반복 요일 고려, 항상 미래
    static func nextFireDate(hour: Int, minute: Int, repeatDays: [Int]) -> Date? {
        let calendar = Calendar.current
        let now = Date()
        let allowed = Set(repeatDays.isEmpty ? Array(0...6) : repeatDays)

        for offset in 0..<8 {
            guard let day = calendar.date(
                byAdding: .day,
                value: offset,
                to: calendar.startOfDay(for: now)
            ) else { continue }
            let weekday = calendar.component(.weekday, from: day) - 1
            guard allowed.contains(weekday) else { continue }

            var components = calendar.dateComponents([.year, .month, .day], from: day)
            components.hour = hour
            components.minute = minute
            components.second = 0
            guard let candidate = calendar.date(from: components) else { continue }
            if candidate.timeIntervalSinceNow > 1 { return candidate }
        }
        return nil
    }

    private func shortId(_ value: String) -> String {
        String(value.prefix(8))
    }
}

enum AlarmKitBridgeError: Error, LocalizedError {
    case notAuthorized
    case unavailable
    case scheduleFailed

    var errorDescription: String? {
        switch self {
        case .notAuthorized: return "AlarmKit 알람 권한이 없습니다"
        case .unavailable: return "AlarmKit 을 사용할 수 없습니다"
        case .scheduleFailed: return "알람 예약에 실패했습니다"
        }
    }
}
#endif
