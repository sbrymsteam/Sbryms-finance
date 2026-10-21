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
        openCallFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openCallFromIntent(intent);
    }

    private void openCallFromIntent(Intent intent) {
        if (intent == null) return;
        String callUrl = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        if (callUrl == null || callUrl.isEmpty()) return;

        Uri uri = Uri.parse("http://localhost/" + callUrl);
        if (!"localhost".equals(uri.getHost()) || !"/team-meet-call.html".equals(uri.getPath())) return;

        WebView webView = getBridge().getWebView();
        webView.postDelayed(() -> webView.loadUrl(uri.toString()), 700);
    }
}
