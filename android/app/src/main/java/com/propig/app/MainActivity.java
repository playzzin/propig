package com.propig.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.auth.FirebaseAuth;

public class MainActivity extends BridgeActivity {
    static final String OPEN_DASHBOARD = "com.propig.app.OPEN_DASHBOARD";
    private final FirebaseAuth.AuthStateListener habitAccountChanged = ignored -> HabitWidget.refresh(this, null);

    @Override public void onStart() {
        super.onStart();
        FirebaseAuth.getInstance().addAuthStateListener(habitAccountChanged);
    }

    @Override public void onStop() {
        FirebaseAuth.getInstance().removeAuthStateListener(habitAccountChanged);
        super.onStop();
    }

    @Override protected void onCreate(Bundle state) {
        registerPlugin(DashboardWidgetPlugin.class);
        super.onCreate(state);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (OPEN_DASHBOARD.equals(intent.getAction()) && bridge != null) {
            bridge.getWebView().loadUrl(bridge.getAppUrl());
        }
    }
}
