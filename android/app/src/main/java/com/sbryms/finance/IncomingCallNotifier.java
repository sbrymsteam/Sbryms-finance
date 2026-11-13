package com.sbryms.finance;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.app.KeyguardManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

final class IncomingCallNotifier {
    static final String EXTRA_CALL_URL = "com.sbryms.finance.CALL_URL";
    static final String EXTRA_CHAT_URL = "com.sbryms.finance.CHAT_URL";
    static final String EXTRA_TARGET_URL = "com.sbryms.finance.TARGET_URL";
    static final String EXTRA_TITLE = "com.sbryms.finance.CALL_TITLE";
    static final String EXTRA_CALL_TYPE = "com.sbryms.finance.CALL_TYPE";
    static final String EXTRA_NOTIFICATION_ID = "com.sbryms.finance.NOTIFICATION_ID";
    static final String CHANNEL_CALLS = "sbryms_incoming_calls_dnd_v3";
    static final String CHANNEL_CALLS_STANDARD = "sbryms_incoming_calls_v3";
    static final String CHANNEL_CALLS_FOREGROUND = "sbryms_incoming_calls_foreground_v3";
    static final String CHANNEL_MESSAGES = "sbryms_messages_v3";
    private static final String TAG = "IncomingCallNotifier";
    private IncomingCallNotifier() {}

    static void show(Context context, Map<String, String> data) {
        String type = data.get("type");
        if (!"team_call".equals(type) && !"message".equals(type)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return;

        boolean call = "team_call".equals(type);
        String callerName = value(data.get("callerName"), "SBRYMS member");
        String senderName = value(data.get("senderName"), value(data.get("title"), "SBRYMS member"));
        String title = call ? callerName : senderName;
        String body = value(data.get("body"), call ? "Incoming call" : "You have a new message");
        String notificationKey = call
            ? value(data.get("callId"), callerName)
            : value(data.get("messageId"), body + System.currentTimeMillis());
        int notificationId = notificationKey.hashCode() & 0x7fffffff;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean bypassDnd = call && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && manager.isNotificationPolicyAccessGranted();
        boolean launchCallScreenDirectly = call && shouldOpenCallScreen(context);
        String channelId = call
            ? (launchCallScreenDirectly
                ? CHANNEL_CALLS_FOREGROUND
                : (bypassDnd ? CHANNEL_CALLS : CHANNEL_CALLS_STANDARD))
            : CHANNEL_MESSAGES;
        createChannel(manager, channelId, call, bypassDnd, launchCallScreenDirectly);

        Intent openIntent;
        PendingIntent fullScreenIntent = null;
        String callUrl = call ? createCallUrl(data) : "";
        if (call) {
            openIntent = new Intent(context, IncomingCallActivity.class)
                .putExtra(EXTRA_CALL_URL, callUrl)
                .putExtra(EXTRA_CHAT_URL, value(
                    data.get("chatUrl"),
                    "/team-meet-chat.html?chat=" + UriEncoder.encode(value(data.get("chat"), "team-group"))
                ))
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
                .putExtra(EXTRA_TARGET_URL, value(data.get("url"), "team-meet.html"))
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
            channelId
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

        RemoteViews messageView = null;
        if (call) {
            if (!launchCallScreenDirectly) {
                notification.setFullScreenIntent(fullScreenIntent, true);
            }
        } else {
            messageView = createMessageNotification(context, senderName, body);
            notification
                .setSubText(context.getString(R.string.app_name))
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(messageView)
                .setCustomBigContentView(messageView);
        }

        NotificationManagerCompat.from(context).notify(notificationId, notification.build());
        if (launchCallScreenDirectly) {
            openIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            try {
                context.startActivity(openIntent);
            } catch (SecurityException error) {
                Log.w(TAG, "Android blocked the direct call-screen launch; using the full-screen notification.", error);
            }
        }
    }

    private static boolean shouldOpenCallScreen(Context context) {
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        KeyguardManager keyguardManager = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH
            && powerManager != null
            && powerManager.isInteractive()
            && keyguardManager != null
            && !keyguardManager.isKeyguardLocked();
    }

    private static RemoteViews createMessageNotification(Context context, String senderName, String body) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.notification_message);
        view.setTextViewText(R.id.message_app_name, context.getString(R.string.app_name));
        view.setTextViewText(R.id.message_notification_time, context.getString(R.string.notification_now));
        view.setTextViewText(R.id.message_sender_name, senderName);
        view.setTextViewText(R.id.message_preview, body);
        view.setImageViewResource(R.id.message_sender_photo, R.mipmap.ic_launcher_round);
        view.setImageViewResource(R.id.message_app_badge, R.mipmap.ic_launcher_round);
        return view;
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

    private static void createChannel(
        NotificationManager manager,
        String channelId,
        boolean call,
        boolean bypassDnd,
        boolean foregroundCall
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(channelId) != null) return;
        NotificationChannel channel = new NotificationChannel(
            channelId,
            call ? "Incoming calls" : "Messages",
            foregroundCall ? NotificationManager.IMPORTANCE_DEFAULT : NotificationManager.IMPORTANCE_HIGH
        );
        channel.setLockscreenVisibility(call ? android.app.Notification.VISIBILITY_PUBLIC : android.app.Notification.VISIBILITY_PRIVATE);
        if (call) {
            channel.setDescription("Incoming SBRYMS audio and video calls");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 500, 250, 500 });
            channel.setBypassDnd(bypassDnd);
            channel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
        } else {
            channel.setDescription("SBRYMS chat message alerts");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 180 });
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
