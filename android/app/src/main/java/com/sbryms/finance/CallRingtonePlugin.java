package com.sbryms.finance;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallRingtone")
public class CallRingtonePlugin extends Plugin {
    @PluginMethod
    public void preview(PluginCall call) {
        try {
            IncomingCallRingtone.preview(getContext(), call.getString("ringtone"));
            call.resolve(new JSObject());
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void setRingtone(PluginCall call) {
        String ringtone = call.getString("ringtone");
        if (ringtone == null) {
            call.reject("A call ringtone must be selected.");
            return;
        }
        try {
            IncomingCallRingtone.setSelected(getContext(), ringtone);
            call.resolve(new JSObject());
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
        }
    }
}
