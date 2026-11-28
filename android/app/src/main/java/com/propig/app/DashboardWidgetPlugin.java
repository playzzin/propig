package com.propig.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Objects;

@CapacitorPlugin(name = "DashboardWidget")
public final class DashboardWidgetPlugin extends Plugin {
    @PluginMethod public void setAccount(PluginCall call) {
        String uid = call.getString("uid");
        SharedPreferences saved = TodayWidget.storage(getContext());
        if (!Objects.equals(saved.getString("uid", null), uid)) {
            saved.edit().clear().putString("uid", uid).apply();
            TodayWidget.refresh(getContext());
            HabitWidget.refresh(getContext(), null);
        }
        call.resolve();
    }

    @PluginMethod public void publish(PluginCall call) {
        SharedPreferences saved = TodayWidget.storage(getContext());
        String uid = call.getString("uid");
        String day = call.getString("date");
        Integer todoDone = call.getInt("todoDone"), todoTotal = call.getInt("todoTotal");
        Integer habitDone = call.getInt("habitDone"), habitTotal = call.getInt("habitTotal");
        if (uid != null && uid.equals(saved.getString("uid", null)) && Habits.today().equals(day)
            && validCount(todoDone, todoTotal) && validCount(habitDone, habitTotal)) {
            saved.edit().putString("date", day).putLong("updatedAt", System.currentTimeMillis())
                .putInt("todoDone", todoDone).putInt("todoTotal", todoTotal)
                .putInt("habitDone", habitDone).putInt("habitTotal", habitTotal).apply();
            TodayWidget.refresh(getContext());
        }
        call.resolve();
    }

    private static boolean validCount(Integer done, Integer total) {
        return done != null && total != null && done >= 0 && done <= total;
    }

    @PluginMethod public void requestPin(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        boolean supported = Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported()
            && manager.requestPinAppWidget(new ComponentName(getContext(), TodayWidget.class), null, null);
        call.resolve(new JSObject().put("supported", supported));
    }
}
