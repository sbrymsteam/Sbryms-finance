package com.sbryms.finance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

public class PresenceService extends Service {
    static final String ACTION_STOP = "com.sbryms.finance.presence.STOP";
    static final String EXTRA_UID = "presence_uid";
    static final String EXTRA_REFRESH_TOKEN = "presence_refresh_token";
    static final String EXTRA_API_KEY = "presence_api_key";
    static final String EXTRA_PROJECT_ID = "presence_project_id";

    private static final String TAG = "PresenceService";
    private static final String CHANNEL_ID = "background_presence";
    private static final int NOTIFICATION_ID = 7312;
    private static final String PREFS_NAME = "background_presence";
    private static final String KEY_ALIAS = "sbryms_presence_key";
    private static final int HEARTBEAT_SECONDS = 30;

    private ScheduledExecutorService executor;
    private String uid;
    private String apiKey;
    private String projectId;
    private String idToken;
    private long idTokenExpiresAt;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SBRYMS:PresenceService");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
        executor = Executors.newSingleThreadScheduledExecutor();
        executor.scheduleWithFixedDelay(
            this::heartbeatSafely,
            HEARTBEAT_SECONDS,
            HEARTBEAT_SECONDS,
            TimeUnit.SECONDS
        );
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            executor.execute(() -> stopPresence(startId));
            return START_NOT_STICKY;
        }

        if (intent != null && intent.hasExtra(EXTRA_UID)) {
            String incomingUid = intent.getStringExtra(EXTRA_UID);
            String incomingRefreshToken = intent.getStringExtra(EXTRA_REFRESH_TOKEN);
            String incomingApiKey = intent.getStringExtra(EXTRA_API_KEY);
            String incomingProjectId = intent.getStringExtra(EXTRA_PROJECT_ID);
            executor.execute(() -> acceptCredentials(
                incomingUid,
                incomingRefreshToken,
                incomingApiKey,
                incomingProjectId
            ));
        } else if (intent == null) {
            executor.execute(this::heartbeatSafely);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (executor != null) executor.shutdownNow();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    private void acceptCredentials(String newUid, String refreshToken, String newApiKey, String newProjectId) {
        if (newUid == null || newUid.isEmpty()
            || refreshToken == null || refreshToken.isEmpty()
            || newApiKey == null || newApiKey.isEmpty()
            || newProjectId == null || newProjectId.isEmpty()) return;

        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedUid = preferences.getString("uid", "");
        if (newUid.equals(savedUid) && !readRefreshToken().isEmpty()) {
            return;
        }
        saveRefreshToken(refreshToken);
        preferences.edit()
            .putString("uid", newUid)
            .putString("apiKey", newApiKey)
            .putString("projectId", newProjectId)
            .apply();
        uid = newUid;
        apiKey = newApiKey;
        projectId = newProjectId;
        idToken = null;
        idTokenExpiresAt = 0;
        heartbeatSafely();
    }

    private void heartbeatSafely() {
        try {
            if (!loadConfiguration()) return;
            String token = getIdToken();
            if (token != null) writePresence(token, "online");
        } catch (Exception error) {
            Log.w(TAG, "Presence heartbeat failed; it will retry.", error);
        }
    }

    private boolean loadConfiguration() {
        if (uid != null && apiKey != null && projectId != null) return true;
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        uid = preferences.getString("uid", null);
        apiKey = preferences.getString("apiKey", null);
        projectId = preferences.getString("projectId", null);
        return uid != null && apiKey != null && projectId != null && !readRefreshToken().isEmpty();
    }

    private String getIdToken() throws Exception {
        if (idToken != null && System.currentTimeMillis() < idTokenExpiresAt - TimeUnit.MINUTES.toMillis(2)) {
            return idToken;
        }

        String refreshToken = readRefreshToken();
        if (refreshToken.isEmpty()) return null;
        HttpURLConnection connection = (HttpURLConnection) new URL(
            "https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(apiKey, "UTF-8")
        ).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int responseCode = connection.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
            connection.disconnect();
            throw new java.io.IOException("Firebase token refresh returned HTTP " + responseCode);
        }
        JSONObject response = new JSONObject(readResponse(connection.getInputStream()));
        connection.disconnect();
        idToken = response.getString("id_token");
        long expiresIn = Long.parseLong(response.optString("expires_in", "3600"));
        idTokenExpiresAt = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(expiresIn);
        String rotatedRefreshToken = response.optString("refresh_token", "");
        if (!rotatedRefreshToken.isEmpty()) saveRefreshToken(rotatedRefreshToken);
        return idToken;
    }

    private void writePresence(String token, String status) throws Exception {
        String documentPath = "https://firestore.googleapis.com/v1/projects/"
            + URLEncoder.encode(projectId, "UTF-8")
            + "/databases/(default)/documents/users/"
            + android.net.Uri.encode(uid);
        android.net.Uri.Builder uri = android.net.Uri.parse(documentPath).buildUpon();
        uri.appendQueryParameter("updateMask.fieldPaths", "status");
        uri.appendQueryParameter("updateMask.fieldPaths", "presenceStatus");
        uri.appendQueryParameter("updateMask.fieldPaths", "lastSeen");

        JSONObject fields = new JSONObject()
            .put("status", new JSONObject().put("stringValue", status))
            .put("presenceStatus", new JSONObject().put("stringValue", status))
            .put("lastSeen", new JSONObject().put("timestampValue", Instant.now().toString()));
        HttpURLConnection connection = (HttpURLConnection) new URL(uri.build().toString()).openConnection();
        connection.setRequestMethod("PATCH");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(new JSONObject().put("fields", fields).toString().getBytes(StandardCharsets.UTF_8));
        }
        int responseCode = connection.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
            String errorBody = readResponse(connection.getErrorStream());
            throw new java.io.IOException("Firestore presence update returned HTTP "
                + responseCode + (errorBody.isEmpty() ? "" : ": " + errorBody));
        }
        connection.disconnect();
    }

    private void stopPresence(int startId) {
        try {
            if (loadConfiguration()) {
                String token = getIdToken();
                if (token != null) writePresence(token, "offline");
            }
        } catch (Exception error) {
            Log.w(TAG, "Could not mark the account offline during logout.", error);
        } finally {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().clear().apply();
            clearRefreshToken();
            stopForeground(true);
            stopSelf(startId);
        }
    }

    private String readRefreshToken() {
        String encrypted = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString("refreshToken", "");
        if (encrypted.isEmpty()) return "";
        try {
            byte[] stored = Base64.decode(encrypted, Base64.NO_WRAP);
            byte[] iv = new byte[12];
            System.arraycopy(stored, 0, iv, 0, iv.length);
            byte[] ciphertext = new byte[stored.length - iv.length];
            System.arraycopy(stored, iv.length, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception error) {
            Log.e(TAG, "Could not decrypt the saved Firebase refresh token.", error);
            return "";
        }
    }

    private void saveRefreshToken(String refreshToken) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8));
            byte[] stored = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, stored, 0, iv.length);
            System.arraycopy(encrypted, 0, stored, iv.length, encrypted.length);
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                .putString("refreshToken", Base64.encodeToString(stored, Base64.NO_WRAP))
                .apply();
        } catch (Exception error) {
            throw new IllegalStateException("Could not securely save the Firebase refresh token.", error);
        }
    }

    private void clearRefreshToken() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().remove("refreshToken").apply();
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private String readResponse(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder response = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) response.append(line);
        }
        return response.toString();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.presence_channel_name),
            NotificationManager.IMPORTANCE_MIN
        );
        channel.setDescription(getString(R.string.presence_channel_description));
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openApp, pendingIntentFlags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.presence_notification_title))
            .setContentText(getString(R.string.presence_notification_text))
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }
}
