package com.sbryms.finance;

import android.content.Intent;
import android.net.Uri;
import android.app.NotificationManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceSettings")
public class DeviceSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent settingsIntent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settingsIntent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            settingsIntent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
        }
        if (settingsIntent.resolveActivity(getContext().getPackageManager()) == null) {
            settingsIntent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
        }
        getActivity().startActivity(settingsIntent);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void openDndAccessSettings(PluginCall call) {
        Intent settingsIntent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        if (settingsIntent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Do Not Disturb access settings are not available on this device.");
            return;
        }
        getActivity().startActivity(settingsIntent);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void getDndAccessStatus(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && manager != null
            && manager.isNotificationPolicyAccessGranted());
        call.resolve(result);
    }
}
