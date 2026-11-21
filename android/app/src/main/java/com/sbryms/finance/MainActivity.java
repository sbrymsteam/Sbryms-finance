package com.sbryms.finance;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final String RECOVERY_PREFERENCES = "renderer_recovery";
    private static final String RECOVERY_COUNT = "count";
    private static final String RECOVERY_TIMESTAMP = "timestamp";
    private static final long RECOVERY_WINDOW_MS = 5 * 60 * 1000;
    private static final int MAX_AUTOMATIC_RECOVERIES = 3;
    private boolean rendererRecoveryScheduled;

    @Override
    protected void load() {
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                if (!rendererRecoveryScheduled) {
                    rendererRecoveryScheduled = true;
                    new Handler(Looper.getMainLooper()).post(MainActivity.this::recoverFromRendererCrash);
                }
                return true;
            }
        });
        super.load();
    }

    private void recoverFromRendererCrash() {
        if (isFinishing() || isDestroyed()) return;

        android.content.SharedPreferences preferences =
            getSharedPreferences(RECOVERY_PREFERENCES, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long previousRecovery = preferences.getLong(RECOVERY_TIMESTAMP, 0);
        int recoveryCount = now - previousRecovery <= RECOVERY_WINDOW_MS
            ? preferences.getInt(RECOVERY_COUNT, 0) + 1
            : 1;
        preferences.edit()
            .putInt(RECOVERY_COUNT, recoveryCount)
            .putLong(RECOVERY_TIMESTAMP, now)
            .apply();

        if (recoveryCount > MAX_AUTOMATIC_RECOVERIES) {
            finish();
            return;
        }

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (!isFinishing() && !isDestroyed()) recreate();
        }, 300);
    }

    @Override
    public void onBackPressed() {
        if (ActiveCallService.isRunning()) {
            moveTaskToBack(true);
            return;
        }
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        WebView.setWebContentsDebuggingEnabled(
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );
        registerPlugin(DeviceSettingsPlugin.class);
        registerPlugin(PresencePlugin.class);
        registerPlugin(CallControlsPlugin.class);
        registerPlugin(CallRingtonePlugin.class);
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null
            && Intent.ACTION_MAIN.equals(getIntent().getAction())
            && getIntent().hasCategory(Intent.CATEGORY_LAUNCHER)) {
            getSharedPreferences(RECOVERY_PREFERENCES, MODE_PRIVATE).edit().clear().apply();
            getWindow().getDecorView().postDelayed(() -> StartupTune.play(this), 350);
        }
        openNotificationTarget(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openNotificationTarget(intent);
    }

    private void openNotificationTarget(Intent intent) {
        if (intent == null) return;
        String target = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        if (target == null || target.isEmpty()) {
            target = intent.getStringExtra(IncomingCallNotifier.EXTRA_TARGET_URL);
        }
        if (target == null || target.isEmpty()) return;

        Uri requested = Uri.parse(target.startsWith("/") ? target : "/" + target);
        String path = requested.getPath();
        if (!"/team-meet-call.html".equals(path)
            && !"/team-meet-chat.html".equals(path)
            && !"/team-meet.html".equals(path)) return;
        Uri uri = new Uri.Builder()
            .scheme("http")
            .authority("localhost")
            .path(path)
            .encodedQuery(requested.getEncodedQuery())
            .build();

        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        if (ActiveCallService.isRunning()
            && "/team-meet-call.html".equals(path)
            && webView.getUrl() != null
            && webView.getUrl().contains("/team-meet-call.html")) return;
        webView.postDelayed(() -> webView.loadUrl(uri.toString()), 700);
    }
}
