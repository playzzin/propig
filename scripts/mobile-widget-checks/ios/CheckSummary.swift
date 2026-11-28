import Foundation

// Exercise the same encoded snapshot the app and WidgetKit exchange.
@main
struct CheckSummary {
    static func main() {
        let now = Date()
        let day = DashboardSummary.dayKey(now)
        let counts = DashboardSummary(day: day, todoDone: 1, todoTotal: 3, habitDone: 2, habitTotal: 4, updatedAt: now)
        let ready = WidgetSnapshot(signedIn: true, summary: counts)
        let persisted = try! JSONEncoder().encode(ready)
        let restored = try! JSONDecoder().decode(WidgetSnapshot.self, from: persisted)
        precondition(restored.summary(on: now)?.todoDone == 1 && restored.summary(on: now)?.habitTotal == 4)
        let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: now)!
        precondition(restored.summary(on: nextDay) == nil)
        precondition(WidgetSnapshot(signedIn: false, summary: counts).summary(on: now) == nil)
        print("PASS same-day iOS summary, next-day expiry and signed-out state")
    }
}
