package com.propig.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.Source;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

public final class HabitWidget extends AppWidgetProvider {
    private static final String TOGGLE = "com.propig.app.habits.TOGGLE";
    private static final String REFRESH = "com.propig.app.habits.REFRESH";
    private static final int[] ROWS = {
        R.id.habit_row_0, R.id.habit_row_1, R.id.habit_row_2, R.id.habit_row_3, R.id.habit_row_4
    };

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (!TOGGLE.equals(action) && !REFRESH.equals(action) &&
            !AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action) &&
            !AppWidgetManager.ACTION_APPWIDGET_OPTIONS_CHANGED.equals(action)) return;

        PendingResult pending = goAsync();
        AtomicBoolean ended = new AtomicBoolean();
        Runnable finish = () -> { if (ended.compareAndSet(false, true)) pending.finish(); };
        new Handler(Looper.getMainLooper()).postDelayed(finish, 8_000);

        String uid = Habits.uid();
        if (TOGGLE.equals(action) && Habits.owns(intent.getStringExtra("uid")) &&
            Habits.today().equals(intent.getStringExtra("date"))) {
            try {
                Habits.save(uid, intent.getStringExtra("date"), intent.getStringExtra("habit"),
                    intent.getBooleanExtra("checked", false)).addOnCompleteListener(result -> {
                        if (Habits.owns(uid)) refresh(context, result.isSuccessful() ? null : "저장 실패", finish);
                        else finish.run();
                    });
                Habits.workspace(uid).get(Source.CACHE).addOnSuccessListener(doc -> {
                    if (Habits.owns(uid)) publish(context, uid, doc, null);
                });
                return;
            } catch (IllegalArgumentException ignored) {
                // A stale widget action can only refresh the current date/account.
            }
        }
        refresh(context, null, finish);
    }

    static void refresh(Context context, String status) {
        refresh(context, status, () -> {});
    }

    private static void refresh(Context context, String status, Runnable done) {
        if (AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, HabitWidget.class)).length == 0) {
            done.run();
            return;
        }
        String uid = Habits.uid();
        if (uid == null) {
            publish(context, null, null, null);
            done.run();
            return;
        }
        Habits.workspace(uid).get().addOnCompleteListener(result -> {
            if (Habits.owns(uid)) publish(context, uid, result.isSuccessful() ? result.getResult() : null,
                result.isSuccessful() ? status : "연결 확인 필요");
            done.run();
        });
    }

    static void publish(Context context, String uid, DocumentSnapshot doc, String message) {
        if (uid != null && !Habits.owns(uid)) return;
        if (uid == null && Habits.uid() != null) return;
        String date = Habits.today();
        List<Habits.Item> items = Habits.items(doc, date);
        List<Habits.Item> selected = new ArrayList<>();
        if (uid != null) {
            Set<String> saved = Habits.selected(context, uid, items);
            for (Habits.Item item : items) if (saved.contains(item.id()) && selected.size() < ROWS.length) selected.add(item);
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int widgetId : manager.getAppWidgetIds(new ComponentName(context, HabitWidget.class))) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.habit_widget);
            PendingIntent open = PendingIntent.getActivity(context, widgetId, new Intent(context, HabitsActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.habit_widget_title, open);
            views.setOnClickPendingIntent(R.id.habit_widget_refresh, pending(context, widgetId, REFRESH, null, null, null, false));
            long completed = selected.stream().filter(Habits.Item::checked).count();
            String status = uid == null ? "앱에서 로그인" : message != null ? message : doc == null ? "불러오는 중" :
                doc.getMetadata().hasPendingWrites() ? "동기화 중" : doc.getMetadata().isFromCache() ? "오프라인" :
                selected.isEmpty() ? "앱에서 습관 선택" : completed + " / " + selected.size() + " 완료";
            views.setTextViewText(R.id.habit_widget_status, status);
            for (int index = 0; index < ROWS.length; index++) {
                int view = ROWS[index];
                views.setViewVisibility(view, index < selected.size() ? View.VISIBLE : View.GONE);
                if (index >= selected.size()) continue;
                Habits.Item item = selected.get(index);
                views.setTextViewText(view, (item.checked() ? "☑ " : "☐ ") + item.name());
                views.setOnClickPendingIntent(view,
                    pending(context, widgetId, TOGGLE, uid, date, item.id(), !item.checked()));
            }
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static PendingIntent pending(Context context, int widgetId, String action, String uid,
        String date, String id, boolean checked) {
        Uri data = new Uri.Builder().scheme("propig-habit-widget").authority("action")
            .appendPath(Integer.toString(widgetId)).appendPath(action).appendPath(id == null ? "" : id).build();
        Intent intent = new Intent(context, HabitWidget.class).setAction(action).setData(data)
            .putExtra("uid", uid).putExtra("date", date).putExtra("habit", id).putExtra("checked", checked);
        return PendingIntent.getBroadcast(context, widgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
