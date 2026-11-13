package com.sbryms.finance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

public class ActiveCallActionReceiver extends BroadcastReceiver {
    static final String ACTION_END_CALL = "com.sbryms.finance.END_ACTIVE_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_END_CALL.equals(intent.getAction())) return;
        String callUrl = intent.getStringExtra(ActiveCallService.EXTRA_CALL_URL);
        if (callUrl == null || callUrl.trim().isEmpty()) return;

        Uri.Builder target = Uri.parse(callUrl.startsWith("/") ? callUrl : "/" + callUrl).buildUpon();
        target.clearQuery();
        Uri original = Uri.parse(callUrl.startsWith("/") ? callUrl : "/" + callUrl);
        for (String key : original.getQueryParameterNames()) {
            if (!"action".equals(key)) {
                for (String value : original.getQueryParameters(key)) {
                    target.appendQueryParameter(key, value);
                }
            }
        }
        target.appendQueryParameter("action", "end");

        context.stopService(new Intent(context, ActiveCallService.class));
        Intent openCall = new Intent(context, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, target.build().toString())
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(openCall);
    }
}
