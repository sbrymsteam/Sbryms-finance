package com.sbryms.finance;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class IncomingCallMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        if ("call_state".equals(remoteMessage.getData().get("type"))) {
            IncomingCallNotifier.dismiss(this, remoteMessage.getData().get("callId"));
        } else {
            IncomingCallNotifier.show(this, remoteMessage.getData());
        }
    }
}
