package com.sbryms.finance;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
        webView.postDelayed(() -> webView.loadUrl(uri.toString()), 700);
    }
}
