import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snapshot: WidgetSnapshot(signedIn: false, summary: nil))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), snapshot: .read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: now)!)
        let snapshot = WidgetSnapshot.read()
        let entries = [TodayEntry(date: now, snapshot: snapshot), TodayEntry(date: midnight, snapshot: snapshot)]
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct SummaryView: View {
    let entry: TodayEntry
    private let green = Color(red: 0.08, green: 0.18, blue: 0.14)

    var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("오늘 요약").font(.headline).foregroundColor(Color(red: 0.65, green: 0.93, blue: 0.78))
            if let summary = entry.snapshot.summary(on: entry.date) {
                Text("할 일  \(summary.todoDone) / \(summary.todoTotal) 완료")
                Text("습관  \(summary.habitDone) / \(summary.habitTotal) 완료")
                Text("\(summary.updatedAt, style: .time) 기준").font(.caption2)
            } else {
                Text(entry.snapshot.signedIn ? "앱을 열어 오늘 기록을 확인하세요" : "앱을 열어 로그인하세요")
                    .font(.subheadline)
            }
        }
        .font(.subheadline).foregroundColor(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .privacySensitive()
        .widgetURL(URL(string: "geuttun://dashboard"))
    }

    @ViewBuilder var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { green }
        } else {
            content.padding().background(green)
        }
    }
}

@main
struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshot.kind, provider: TodayProvider()) { SummaryView(entry: $0) }
            .configurationDisplayName("오늘 요약")
            .description("할 일과 습관의 완료 수를 확인하고 그뚠앱 대시보드를 엽니다.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
