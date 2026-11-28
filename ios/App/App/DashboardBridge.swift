import Capacitor
import WidgetKit

class DashboardBridge: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DashboardWidgetPlugin())
    }
}

@objc(DashboardWidgetPlugin)
class DashboardWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "DashboardWidgetPlugin"
    let jsName = "DashboardWidget"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise)
    ]
    private let ownerKey = "widgetAccount"

    @objc func setAccount(_ call: CAPPluginCall) {
        let uid = call.getString("uid")
        if UserDefaults.standard.string(forKey: ownerKey) != uid || WidgetSnapshot.read().signedIn != (uid != nil) {
            WidgetSnapshot(signedIn: uid != nil, summary: nil).write()
            UserDefaults.standard.set(uid, forKey: ownerKey)
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.kind)
        }
        call.resolve()
    }

    @objc func publish(_ call: CAPPluginCall) {
        let now = Date()
        guard let uid = call.getString("uid"), uid == UserDefaults.standard.string(forKey: ownerKey),
              let day = call.getString("date"), day == DashboardSummary.dayKey(now),
              let todoDone = call.getInt("todoDone"), let todoTotal = call.getInt("todoTotal"),
              let habitDone = call.getInt("habitDone"), let habitTotal = call.getInt("habitTotal"),
              todoDone >= 0, todoDone <= todoTotal, habitDone >= 0, habitDone <= habitTotal else {
            call.resolve()
            return
        }
        let summary = DashboardSummary(day: day, todoDone: todoDone, todoTotal: todoTotal,
                                       habitDone: habitDone, habitTotal: habitTotal, updatedAt: now)
        WidgetSnapshot(signedIn: true, summary: summary).write()
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.kind)
        call.resolve()
    }
}
