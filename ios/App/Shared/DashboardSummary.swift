import Foundation

struct DashboardSummary: Codable {
    let day: String
    let todoDone: Int
    let todoTotal: Int
    let habitDone: Int
    let habitTotal: Int
    let updatedAt: Date

    static func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct WidgetSnapshot: Codable {
    static let kind = "GeuttunToday"
    static let group = "group.com.propig.app.widgets"
    private static let key = "todaySnapshot"
    let signedIn: Bool
    let summary: DashboardSummary?

    static func read() -> WidgetSnapshot {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key),
              let stored = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else {
            return WidgetSnapshot(signedIn: false, summary: nil)
        }
        return stored
    }

    func write() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: Self.group)?.set(data, forKey: Self.key)
    }

    func summary(on date: Date) -> DashboardSummary? {
        guard signedIn, let summary, summary.day == DashboardSummary.dayKey(date) else { return nil }
        return summary
    }
}
