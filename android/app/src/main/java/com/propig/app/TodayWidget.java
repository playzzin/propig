package com.propig.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.text.DateFormat;
import java.util.Date;

public final class TodayWidget extends AppWidgetProvider {
    static SharedPreferences storage(Context context) {
        return context.getSharedPreferences("dashboard-today", Context.MODE_PRIVATE);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        render(context, manager, manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class)));
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences saved = storage(context);
        boolean signedIn = saved.contains("uid");
        boolean hasToday = signedIn && Habits.today().equals(saved.getString("date", ""));
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.today_widget);
        int visibility = hasToday ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.today_widget_summary_todo, visibility);
        views.setViewVisibility(R.id.today_widget_summary_habit, visibility);
        String status = signedIn ? "앱을 열어 오늘 기록을 확인하세요" : "앱을 열어 로그인하세요";
        if (hasToday) {
            views.setTextViewText(R.id.today_widget_summary_todo, count(saved, "할 일", "todo"));
            views.setTextViewText(R.id.today_widget_summary_habit, count(saved, "습관", "habit"));
            Date updated = new Date(saved.getLong("updatedAt", 0));
            status = DateFormat.getTimeInstance(DateFormat.SHORT).format(updated) + " 기준";
        }
        views.setTextViewText(R.id.today_widget_status, status);
        Intent intent = new Intent(context, MainActivity.class).setAction(MainActivity.OPEN_DASHBOARD)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        views.setOnClickPendingIntent(R.id.today_widget_root, PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        manager.updateAppWidget(ids, views);
    }

    private static String count(SharedPreferences saved, String title, String key) {
        return title + "  " + saved.getInt(key + "Done", 0) + " / " + saved.getInt(key + "Total", 0) + " 완료";
    }
}
