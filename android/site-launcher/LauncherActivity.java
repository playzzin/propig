package com.propig.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** No WebView, credentials, trackers, storage or runtime permissions. */
public final class LauncherActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            String home = getString(getResources().getIdentifier("site_home", "string", getPackageName()));
            Uri uri = Uri.parse(home);
            if (!"https".equals(uri.getScheme()) || !"propig-63524.web.app".equals(uri.getHost())) {
                throw new IllegalStateException("Invalid compiled destination");
            }
            Intent browser = new Intent(Intent.ACTION_VIEW, uri);
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(browser);
            finish();
        } catch (ActivityNotFoundException error) {
            new AlertDialog.Builder(this).setTitle("브라우저가 필요합니다")
                .setMessage("Chrome 등 웹 브라우저를 설치한 뒤 다시 실행해주세요.")
                .setPositiveButton("닫기", new android.content.DialogInterface.OnClickListener() {
                    public void onClick(android.content.DialogInterface dialog, int which) { finish(); }
                })
                .setOnCancelListener(new android.content.DialogInterface.OnCancelListener() {
                    public void onCancel(android.content.DialogInterface dialog) { finish(); }
                }).show();
        }
    }
}
