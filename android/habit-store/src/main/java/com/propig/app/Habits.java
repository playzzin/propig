package com.propig.app;

import android.content.Context;
import com.google.android.gms.tasks.Task;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldPath;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TimeZone;

final class Habits {
    static final int WIDGET_LIMIT = 5;

    record Item(String id, String name, boolean checked, int order) {}

    private Habits() {}

    static String uid() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        return user == null ? null : user.getUid();
    }

    static boolean owns(String uid) {
        return uid != null && Objects.equals(uid, uid());
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    }

    static DocumentReference workspace(String uid) {
        return FirebaseFirestore.getInstance(FirebaseApp.getInstance(), "pppp")
            .collection("users").document(uid).collection("habitTracker").document("workspace");
    }

    static Task<Void> save(String uid, String date, String id, boolean checked) {
        if (!owns(uid) || !today().equals(date) || id == null || id.trim().isEmpty() || id.length() > 500) {
            throw new IllegalArgumentException("The date, account or habit changed.");
        }
        SimpleDateFormat clock = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        clock.setTimeZone(TimeZone.getTimeZone("UTC"));
        return workspace(uid).update(
            FieldPath.of("records", date, id, "checked"), checked,
            FieldPath.of("records", date, id, "updatedAt"), clock.format(new Date()),
            "updatedAt", FieldValue.serverTimestamp()
        );
    }

    static List<Item> items(DocumentSnapshot snapshot, String date) {
        List<Item> items = new ArrayList<>();
        if (snapshot == null || !(snapshot.get("habits") instanceof List<?> entries)) return items;
        for (Object raw : entries) {
            if (!(raw instanceof Map<?, ?> entry) || !(entry.get("id") instanceof String id) ||
                id.trim().isEmpty() || !(entry.get("name") instanceof String name) || !"check".equals(entry.get("mode"))) continue;
            Object order = entry.get("order");
            boolean checked = Boolean.TRUE.equals(snapshot.get(FieldPath.of("records", date, id, "checked")));
            items.add(new Item(id, name, checked, order instanceof Number n ? n.intValue() : 0));
        }
        items.sort(Comparator.comparingInt(Item::order));
        return items;
    }

    static Set<String> selected(Context context, String uid, List<Item> rows) {
        Set<String> stored = context.getSharedPreferences("habit-widget", Context.MODE_PRIVATE).getStringSet(uid, null);
        if (stored != null) return new HashSet<>(stored);
        Set<String> result = new HashSet<>();
        for (Item row : rows) {
            if (result.size() == WIDGET_LIMIT) break;
            result.add(row.id());
        }
        return result;
    }

    static void saveSelected(Context context, String uid, Set<String> ids) {
        if (!owns(uid) || ids.size() > WIDGET_LIMIT) return;
        context.getSharedPreferences("habit-widget", Context.MODE_PRIVATE).edit().putStringSet(uid, ids).apply();
    }
}
