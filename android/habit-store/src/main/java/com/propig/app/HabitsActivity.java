package com.propig.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.GoogleAuthProvider;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import java.util.List;
import java.util.Set;

public final class HabitsActivity extends Activity {
    private final FirebaseAuth auth = FirebaseAuth.getInstance();
    private final FirebaseAuth.AuthStateListener authListener = ignored -> connect();
    private ListenerRegistration listener;
    private DocumentSnapshot workspace;
    private String message;
    private boolean signingIn;
    private ScrollView scroll;
    private LinearLayout screen;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        scroll = new ScrollView(this);
        screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setPadding(dp(20), dp(32), dp(20), dp(24));
        screen.setBackgroundColor(Color.rgb(16, 24, 33));
        scroll.addView(screen, new ViewGroup.LayoutParams(-1, -1));
        setContentView(scroll);
        render();
    }

    @Override protected void onStart() {
        super.onStart();
        auth.addAuthStateListener(authListener);
    }

    @Override protected void onStop() {
        auth.removeAuthStateListener(authListener);
        if (listener != null) listener.remove();
        listener = null;
        super.onStop();
    }

    private void connect() {
        if (listener != null) listener.remove();
        workspace = null;
        String uid = Habits.uid();
        HabitWidget.publish(this, uid, null, null);
        render();
        if (uid == null) return;
        listener = Habits.workspace(uid).addSnapshotListener(MetadataChanges.INCLUDE, (data, error) -> {
            if (!Habits.owns(uid)) return;
            workspace = data;
            message = error == null ? null : "기록을 불러오지 못했습니다.";
            HabitWidget.publish(this, uid, data, message);
            render();
        });
    }

    private void signIn() {
        signingIn = true;
        message = null;
        render();
        GetGoogleIdOption option = new GetGoogleIdOption.Builder()
            .setServerClientId(getString(R.string.default_web_client_id))
            .setFilterByAuthorizedAccounts(false)
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(this).getCredentialAsync(this, request, null, this::runOnUiThread,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse response) {
                    if (!(response.getCredential() instanceof CustomCredential credential) ||
                        !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        signInResult(false);
                        return;
                    }
                    try {
                        String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                        auth.signInWithCredential(GoogleAuthProvider.getCredential(token, null))
                            .addOnCompleteListener(HabitsActivity.this, result -> signInResult(result.isSuccessful()));
                    } catch (RuntimeException e) {
                        signInResult(false);
                    }
                }

                @Override public void onError(@NonNull GetCredentialException error) {
                    signInResult(false);
                }
            });
    }

    private void signInResult(boolean success) {
        signingIn = false;
        message = success ? null : "Google 계정에 연결하지 못했습니다. 다시 시도해 주세요.";
        render();
    }

    private void render() {
        int offset = scroll.getScrollY();
        screen.removeAllViews();
        text("오늘 습관", 26, 0xff8ef0b9);
        if (message != null) text(message, 15, 0xffffc2ad);
        String uid = Habits.uid();
        if (uid == null) {
            text("기존 ProPig Google 계정으로 로그인", 15, 0xffcad6e1);
            Button login = button(signingIn ? "로그인 중" : "Google 로그인", this::signIn);
            login.setEnabled(!signingIn);
            return;
        }
        String date = Habits.today();
        if (workspace != null && workspace.getMetadata().hasPendingWrites()) text("동기화 중", 14, 0xffcad6e1);
        button("홈 화면 위젯 추가", this::requestWidget);
        button("로그아웃", () -> {
            auth.signOut();
            HabitWidget.publish(this, null, null, null);
        });
        if (workspace == null) return;
        List<Habits.Item> rows = Habits.items(workspace, date);
        if (rows.isEmpty()) {
            text("웹의 ProPig 습관 트래커에서 체크형 습관을 추가하세요.", 15, 0xffcad6e1);
            return;
        }
        Set<String> selected = Habits.selected(this, uid, rows);
        text("위젯에 표시할 습관을 최대 5개 고를 수 있습니다.", 14, 0xffcad6e1);
        for (Habits.Item row : rows) {
            CheckBox check = checkBox(row.name(), row.checked());
            check.setOnCheckedChangeListener((view, value) -> {
                try {
                    Habits.save(uid, date, row.id(), value).addOnFailureListener(error -> {
                        if (!Habits.owns(uid)) return;
                        message = "습관 기록을 저장하지 못했습니다.";
                        render();
                    });
                } catch (IllegalArgumentException error) {
                    render();
                }
            });
            CheckBox pick = checkBox("위젯 표시 · " + row.name(), selected.contains(row.id()));
            pick.setTextSize(13);
            pick.setOnCheckedChangeListener((view, value) -> {
                if (value && selected.size() >= Habits.WIDGET_LIMIT) {
                    pick.setChecked(false);
                    Toast.makeText(this, "위젯에는 다섯 개까지 선택할 수 있습니다.", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (value) selected.add(row.id());
                else selected.remove(row.id());
                Habits.saveSelected(this, uid, selected);
                HabitWidget.publish(this, uid, workspace, null);
            });
        }
        scroll.post(() -> scroll.scrollTo(0, offset));
    }

    private void requestWidget() {
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager manager = AppWidgetManager.getInstance(this);
            if (manager.isRequestPinAppWidgetSupported()) {
                manager.requestPinAppWidget(new ComponentName(this, HabitWidget.class), null, null);
                return;
            }
        }
        Toast.makeText(this, "홈 화면의 위젯 메뉴에서 ProPig 습관을 추가하세요.", Toast.LENGTH_LONG).show();
    }

    private int dp(int value) { return (int) (getResources().getDisplayMetrics().density * value); }

    private void text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setPadding(0, dp(6), 0, dp(6));
        screen.addView(view);
    }

    private Button button(String label, Runnable onClick) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(view -> onClick.run());
        screen.addView(button);
        return button;
    }

    private CheckBox checkBox(String label, boolean checked) {
        CheckBox view = new CheckBox(this);
        view.setText(label);
        view.setChecked(checked);
        screen.addView(view);
        return view;
    }
}
