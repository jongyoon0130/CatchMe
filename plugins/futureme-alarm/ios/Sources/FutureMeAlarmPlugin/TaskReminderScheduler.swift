import Foundation
import UserNotifications

enum TaskReminderScheduler {
    static let idPrefix = "fm-task-"

    struct Row {
        let fireDate: String
        let fireTime: String
        let kind: String
        let itemId: String
        let label: String
    }

    static func identifier(for row: Row) -> String {
        let safeItem = row.itemId.replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "-", options: .regularExpression)
        return "\(idPrefix)\(row.fireDate)-\(safeItem)-\(row.kind)"
    }

    static func parseRows(_ raw: [[String: Any]]) -> [Row] {
        raw.compactMap { dict in
            guard
                let fireDate = dict["fire_date"] as? String,
                let fireTime = dict["fire_time"] as? String,
                let kind = dict["kind"] as? String,
                let itemId = dict["item_id"] as? String,
                let label = dict["label"] as? String
            else { return nil }
            return Row(fireDate: fireDate, fireTime: fireTime, kind: kind, itemId: itemId, label: label)
        }
    }

    static func title(for row: Row) -> String {
        if row.kind == "start" {
            return "이제 시작할 시간이야 — \(row.label)"
        }
        return "\(row.label), 잘 끝났어? 기록해두자"
    }

    static func fireDate(from row: Row) -> Date? {
        let dateParts = row.fireDate.split(separator: "-").compactMap { Int($0) }
        let timeParts = row.fireTime.split(separator: ":").compactMap { Int($0) }
        guard dateParts.count == 3, timeParts.count >= 2 else { return nil }
        var dc = DateComponents()
        dc.year = dateParts[0]
        dc.month = dateParts[1]
        dc.day = dateParts[2]
        dc.hour = timeParts[0]
        dc.minute = timeParts[1]
        dc.second = 0
        return Calendar.current.date(from: dc)
    }

    static func sync(rows: [Row], completion: @escaping (Int, Int) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let stale = pending
                .map(\.identifier)
                .filter { $0.hasPrefix(idPrefix) }
            center.removePendingNotificationRequests(withIdentifiers: stale)

            let now = Date()
            var scheduled = 0
            var skipped = 0
            let group = DispatchGroup()

            for row in rows {
                guard let fireAt = fireDate(from: row) else {
                    skipped += 1
                    continue
                }
                if fireAt.timeIntervalSince(now) < -30 {
                    skipped += 1
                    continue
                }

                var dc = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
                dc.second = 0
                let trigger = UNCalendarNotificationTrigger(dateMatching: dc, repeats: false)

                let content = UNMutableNotificationContent()
                content.title = title(for: row)
                content.body = row.kind == "end" ? "끝났으면 홈에서 완료 표시해줘" : "Catch Me"
                content.sound = .default
                content.userInfo = [
                    "type": "task-reminder",
                    "kind": row.kind,
                    "itemId": row.itemId,
                    "fireDate": row.fireDate,
                ]

                let request = UNNotificationRequest(
                    identifier: identifier(for: row),
                    content: content,
                    trigger: trigger
                )

                group.enter()
                center.add(request) { error in
                    if error == nil { scheduled += 1 } else { skipped += 1 }
                    group.leave()
                }
            }

            group.notify(queue: .main) {
                completion(scheduled, skipped)
            }
        }
    }

    static func pendingTaskCount(completion: @escaping (Int) -> Void) {
        UNUserNotificationCenter.current().getPendingNotificationRequests { pending in
            let count = pending.filter { $0.identifier.hasPrefix(idPrefix) }.count
            completion(count)
        }
    }
}
