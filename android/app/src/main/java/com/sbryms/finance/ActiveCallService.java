package com.sbryms.finance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class ActiveCallService extends Service {
    static final String EXTRA_CALL_ID = "com.sbryms.finance.ACTIVE_CALL_ID";
    static final String EXTRA_CALL_NAME = "com.sbryms.finance.ACTIVE_CALL_NAME";
    static final String EXTRA_CALL_TYPE = "com.sbryms.finance.ACTIVE_CALL_TYPE";
    static final String EXTRA_CALL_URL = "com.sbryms.finance.ACTIVE_CALL_URL";
    static final String CHANNEL_ID = "sbryms_active_calls_v1";
    private static final int NOTIFICATION_ID = 2352701;
    private static volatile boolean running;

    static boolean isRunning() {
        return running;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        String callId = intent.getStringExtra(EXTRA_CALL_ID);
        String callUrl = intent.getStringExtra(EXTRA_CALL_URL);
        if (callId == null || callId.isEmpty() || callUrl == null || callUrl.isEmpty()) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        running = true;
        startForeground(NOTIFICATION_ID, buildNotification(intent));
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification(Intent serviceIntent) {
        String callName = serviceIntent.getStringExtra(EXTRA_CALL_NAME);
        String callType = serviceIntent.getStringExtra(EXTRA_CALL_TYPE);
        String callUrl = serviceIntent.getStringExtra(EXTRA_CALL_URL);
        String callId = serviceIntent.getStringExtra(EXTRA_CALL_ID);
        String title = callName == null || callName.trim().isEmpty()
            ? getString(R.string.app_name)
            : callName.trim();
        String typeLabel = "video".equals(callType) ? "video" : "audio";

        Intent openCall = new Intent(this, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            openCall,
            pendingIntentFlags()
        );

        Intent endCall = new Intent(this, ActiveCallActionReceiver.class)
            .setAction(ActiveCallActionReceiver.ACTION_END_CALL)
            .putExtra(EXTRA_CALL_URL, callUrl)
            .putExtra(EXTRA_CALL_ID, callId);
        PendingIntent endPendingIntent = PendingIntent.getBroadcast(
            this,
            NOTIFICATION_ID + 1,
            endCall,
            pendingIntentFlags()
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Call with " + title)
            .setContentText("Ongoing " + typeLabel + " call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(0, "End call", endPendingIntent)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Active calls",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows when an audio or video call is continuing in the background.");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }
}
