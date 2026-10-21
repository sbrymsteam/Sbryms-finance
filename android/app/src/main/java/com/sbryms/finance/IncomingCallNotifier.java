package com.sbryms.finance;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

final class IncomingCallNotifier {
    static final String EXTRA_CALL_URL = "com.sbryms.finance.CALL_URL";
    static final String EXTRA_TITLE = "com.sbryms.finance.CALL_TITLE";
    static final String EXTRA_CALL_TYPE = "com.sbryms.finance.CALL_TYPE";
    static final String EXTRA_NOTIFICATION_ID = "com.sbryms.finance.NOTIFICATION_ID";
    static final String CHANNEL_CALLS = "sbryms_incoming_calls";
    static final String CHANNEL_MESSAGES = "sbryms_messages";
    private static final String ACTION_DECLINE = "com.sbryms.finance.DECLINE_CALL";

    private IncomingCallNotifier() {}

    static void show(Context context, Map<String, String> data) {
        String type = data.get("type");
        if (!"team_call".equals(type) && !"message".equals(type)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return;

        boolean call = "team_call".equals(type);
        String callerName = value(data.get("callerName"), "SBRYMS member");
        String title = call ? callerName : value(data.get("title"), "SBRYMS Finance");
        String body = value(data.get("body"), call ? "Incoming call" : "You have a new message");
        int notificationId = value(data.get("callId"), body).hashCode() & 0x7fffffff;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        createChannel(manager, call);

        Intent openIntent;
        PendingIntent fullScreenIntent = null;
        String callUrl = call ? createCallUrl(data) : "";
        if (call) {
            openIntent = new Intent(context, IncomingCallActivity.class)
                .putExtra(EXTRA_CALL_URL, callUrl)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_CALL_TYPE, value(data.get("callType"), "audio"))
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
            fullScreenIntent = PendingIntent.getActivity(
                context,
                notificationId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        } else {
            openIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }

        PendingIntent contentIntent = fullScreenIntent != null
            ? fullScreenIntent
            : PendingIntent.getActivity(
                context,
                notificationId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            context,
            call ? CHANNEL_CALLS : CHANNEL_MESSAGES
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(call ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(call ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(call ? NotificationCompat.VISIBILITY_PUBLIC : NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(!call)
            .setOngoing(call)
            .setContentIntent(contentIntent)
            .setTimeoutAfter(call ? 60000 : 120000);

        if (call) {
            notification.setFullScreenIntent(fullScreenIntent, true);
            Intent answerIntent = new Intent(context, MainActivity.class)
                .putExtra(EXTRA_CALL_URL, callUrl)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent answerPendingIntent = PendingIntent.getActivity(
                context,
                notificationId + 1,
                answerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            Intent declineIntent = new Intent(context, IncomingCallActionReceiver.class)
                .setAction(ACTION_DECLINE)
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                .putExtra(EXTRA_CALL_URL, callUrl);
            PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId + 2,
                declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            notification
                .addAction(android.R.drawable.sym_action_call, "Answer", answerPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent);
        }

        NotificationManagerCompat.from(context).notify(notificationId, notification.build());
    }

    static String createCallUrl(Map<String, String> data) {
        boolean group = "true".equals(data.get("groupCall"));
        StringBuilder url = new StringBuilder("team-meet-call.html?chat=");
        url.append(UriEncoder.encode(group ? "team-group" : value(data.get("chat"), "")));
        if (group) {
            url.append("&group=true&room=").append(UriEncoder.encode(value(data.get("roomId"), "")));
            url.append("&call=").append(UriEncoder.encode(value(data.get("callId"), "")));
        } else {
            url.append("&call=").append(UriEncoder.encode(value(data.get("callId"), "")));
        }
        url.append("&role=callee&type=").append(UriEncoder.encode(value(data.get("callType"), "audio")));
        return url.toString();
    }

    private static void createChannel(NotificationManager manager, boolean call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        String channelId = call ? CHANNEL_CALLS : CHANNEL_MESSAGES;
        if (manager.getNotificationChannel(channelId) != null) return;
        NotificationChannel channel = new NotificationChannel(
            channelId,
            call ? "Incoming calls" : "Messages",
            call ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setLockscreenVisibility(call ? android.app.Notification.VISIBILITY_PUBLIC : android.app.Notification.VISIBILITY_PRIVATE);
        if (call) {
            channel.setDescription("Incoming SBRYMS audio and video calls");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 500, 250, 500 });
            channel.setBypassDnd(false);
        }
        manager.createNotificationChannel(channel);
    }

    private static String value(String input, String fallback) {
        return input == null || input.trim().isEmpty() ? fallback : input.trim();
    }

    private static final class UriEncoder {
        private UriEncoder() {}

        static String encode(String value) {
            return android.net.Uri.encode(value);
        }
    }
}
