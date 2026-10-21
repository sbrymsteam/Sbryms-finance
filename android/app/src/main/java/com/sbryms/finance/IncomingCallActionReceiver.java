package com.sbryms.finance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;

public class IncomingCallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"com.sbryms.finance.DECLINE_CALL".equals(intent.getAction())) return;
        int notificationId = intent.getIntExtra(IncomingCallNotifier.EXTRA_NOTIFICATION_ID, 0);
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(notificationId);
        String callUrl = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        if (callUrl == null) return;
        Intent callIntent = new Intent(context, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl + "&action=decline")
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(callIntent);
    }
}
