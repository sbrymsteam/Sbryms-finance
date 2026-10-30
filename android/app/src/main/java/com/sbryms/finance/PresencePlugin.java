package com.sbryms.finance;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.ContextCompat;

@CapacitorPlugin(name = "Presence")
public class PresencePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String uid = call.getString("uid");
        String refreshToken = call.getString("refreshToken");
        String apiKey = call.getString("apiKey");
        String projectId = call.getString("projectId");
        if (uid == null || uid.isEmpty()
            || refreshToken == null || refreshToken.isEmpty()
            || apiKey == null || apiKey.isEmpty()
            || projectId == null || projectId.isEmpty()) {
            call.reject("A signed-in Firebase account is required to start presence.");
            return;
        }

        Intent serviceIntent = new Intent(getContext(), PresenceService.class)
            .putExtra(PresenceService.EXTRA_UID, uid)
            .putExtra(PresenceService.EXTRA_REFRESH_TOKEN, refreshToken)
            .putExtra(PresenceService.EXTRA_API_KEY, apiKey)
            .putExtra(PresenceService.EXTRA_PROJECT_ID, projectId);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Could not start background presence service.", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), PresenceService.class)
            .setAction(PresenceService.ACTION_STOP);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Could not stop background presence service.", error);
        }
    }
}
