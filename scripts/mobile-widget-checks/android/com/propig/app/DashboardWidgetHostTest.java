package com.propig.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.Activity;
import android.app.Instrumentation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class DashboardWidgetHostTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    @Test public void rendersBothHomeWidgetsAndOpensDashboardFromToday() {
        Context context = instrumentation.getTargetContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetHost host = new AppWidgetHost(context, 0x4754);
        Activity activity = instrumentation.startActivitySync(
            new Intent().setClassName(context, "com.propig.app.HabitsActivity")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        LinearLayout mount = new LinearLayout(activity);
        instrumentation.runOnMainSync(() -> {
            mount.setOrientation(LinearLayout.VERTICAL);
            activity.setContentView(mount);
            host.startListening();
        });

        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(
            "com.propig.app.MainActivity", null, false);
        try {
            AppWidgetHostView habit = bind(context, manager, host, mount, "com.propig.app.HabitWidget");
            AppWidgetHostView today = bind(context, manager, host, mount, "com.propig.app.TodayWidget");
            waitForText(habit, R.id.habit_widget_status, "앱에서 로그인");
            waitForText(today, R.id.today_widget_status, "앱을 열어 로그인하세요");

            AtomicBoolean clicked = new AtomicBoolean();
            instrumentation.runOnMainSync(() -> {
                View root = today.findViewById(R.id.today_widget_root);
                clicked.set(root != null && root.performClick());
            });
            assertTrue("Today widget has a tappable RemoteViews action", clicked.get());
            Activity opened = instrumentation.waitForMonitorWithTimeout(monitor, 15_000);
            assertNotNull("Tapping Today must start the dashboard activity", opened);
            assertEquals("com.propig.app.MainActivity", opened.getClass().getName());
            assertEquals("com.propig.app.OPEN_DASHBOARD", opened.getIntent().getAction());
            verifyAccountChanges((MainActivity) opened, today);
        } finally {
            instrumentation.removeMonitor(monitor);
            instrumentation.runOnMainSync(() -> {
                host.stopListening();
                host.deleteHost();
                activity.finish();
            });
        }
    }

    private void verifyAccountChanges(MainActivity app, AppWidgetHostView today) {
        // Drive the registered native plugin with local fixtures; a live web login is unnecessary.
        instrumentation.runOnMainSync(() -> {
            app.getBridge().getWebView().stopLoading();
            app.getBridge().getWebView().getSettings().setJavaScriptEnabled(false);
        });
        DashboardWidgetPlugin plugin = (DashboardWidgetPlugin) app.getBridge().getPlugin("DashboardWidget").getInstance();
        JSObject counts = new JSObject().put("uid", "widget-qa-a").put("date", Habits.today())
            .put("todoDone", 1).put("todoTotal", 3).put("habitDone", 2).put("habitTotal", 4);
        try {
            plugin.setAccount(call("setAccount", new JSObject().put("uid", "widget-qa-a")));
            plugin.publish(call("publish", counts));
            waitForText(today, R.id.today_widget_summary_todo, "할 일  1 / 3 완료");
            waitForText(today, R.id.today_widget_summary_habit, "습관  2 / 4 완료");

            plugin.setAccount(call("setAccount", new JSObject().put("uid", "widget-qa-b")));
            plugin.publish(call("publish", counts)); // late callback from the previous account
            counts.put("uid", "widget-qa-b").put("date", "2000-01-01");
            plugin.publish(call("publish", counts));
            waitForText(today, R.id.today_widget_status, "앱을 열어 오늘 기록을 확인하세요");
            assertTrue("Stale account/date cannot repopulate the widget cache",
                !TodayWidget.storage(app).contains("date"));
        } finally {
            plugin.setAccount(call("setAccount", new JSObject()));
        }
        waitForText(today, R.id.today_widget_status, "앱을 열어 로그인하세요");
    }

    private static PluginCall call(String method, JSObject data) {
        return new PluginCall(null, "DashboardWidget", PluginCall.CALLBACK_ID_DANGLING, method, data) {
            @Override public void resolve() { /* There is no JavaScript callback in the test. */ }
        };
    }

    private AppWidgetHostView bind(Context context, AppWidgetManager manager, AppWidgetHost host,
                                   LinearLayout mount, String providerClass) {
        ComponentName provider = new ComponentName(context, providerClass);
        AppWidgetProviderInfo info = manager.getInstalledProviders().stream()
            .filter(candidate -> provider.equals(candidate.provider)).findFirst().orElse(null);
        assertNotNull("Android registered " + providerClass, info);
        assertTrue("Home screen category for " + providerClass,
            (info.widgetCategory & AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN) != 0);
        int id = host.allocateAppWidgetId();
        assertTrue("Android bound " + providerClass, manager.bindAppWidgetIdIfAllowed(id, provider));
        assertEquals(provider, manager.getAppWidgetInfo(id).provider);
        AtomicReference<AppWidgetHostView> view = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            view.set(host.createView(mount.getContext(), id, info));
            mount.addView(view.get(), new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        });
        return view.get();
    }

    private void waitForText(AppWidgetHostView view, int id, String expected) {
        long deadline = SystemClock.elapsedRealtime() + 20_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            AtomicBoolean matched = new AtomicBoolean();
            instrumentation.runOnMainSync(() -> {
                TextView label = view.findViewById(id);
                matched.set(label != null && label.getVisibility() == View.VISIBLE && expected.contentEquals(label.getText()));
            });
            if (matched.get()) return;
            SystemClock.sleep(100);
        }
        fail("Timed out waiting for widget state: " + expected);
    }
}
