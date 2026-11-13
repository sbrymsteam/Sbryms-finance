package com.sbryms.finance;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.ContextCompat;

@CapacitorPlugin(name = "CallControls")
public class CallControlsPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String callId = call.getString("callId");
        String name = call.getString("name");
        String callType = call.getString("callType");
        String url = call.getString("url");
        if (callId == null || callId.isEmpty() || url == null || url.isEmpty()) {
            call.reject("Call details are required for an active-call notification.");
            return;
        }
        Intent serviceIntent = new Intent(getContext(), ActiveCallService.class)
            .putExtra(ActiveCallService.EXTRA_CALL_ID, callId)
            .putExtra(ActiveCallService.EXTRA_CALL_NAME, name)
            .putExtra(ActiveCallService.EXTRA_CALL_TYPE, callType)
            .putExtra(ActiveCallService.EXTRA_CALL_URL, url);
        try {
            ContextCompat.startForegroundService(getContext(), serviceIntent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Could not show the active-call notification.", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ActiveCallService.class));
        call.resolve();
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().moveTaskToBack(true);
        call.resolve();
    }
}
