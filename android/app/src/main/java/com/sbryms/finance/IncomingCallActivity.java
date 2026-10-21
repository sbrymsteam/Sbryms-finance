package com.sbryms.finance;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class IncomingCallActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        renderCallScreen();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        renderCallScreen();
    }

    private void showOverLockScreen() {
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    private void renderCallScreen() {
        String title = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_TITLE);
        String type = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_TYPE);
        boolean video = "video".equals(type);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(40, 56, 40, 56);
        root.setBackgroundColor(Color.rgb(5, 12, 24));

        TextView label = new TextView(this);
        label.setText(video ? "INCOMING VIDEO CALL" : "INCOMING AUDIO CALL");
        label.setTextColor(Color.rgb(68, 220, 202));
        label.setTextSize(14);
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setGravity(Gravity.CENTER);

        TextView caller = new TextView(this);
        caller.setText(title == null ? "SBRYMS call" : title);
        caller.setTextColor(Color.WHITE);
        caller.setTextSize(28);
        caller.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        caller.setGravity(Gravity.CENTER);
        caller.setPadding(0, 28, 0, 10);

        TextView hint = new TextView(this);
        hint.setText("Tap Answer to join the call");
        hint.setTextColor(Color.LTGRAY);
        hint.setTextSize(16);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, 0, 0, 72);

        Button answer = new Button(this);
        answer.setText("Answer");
        answer.setTextSize(18);
        answer.setTextColor(Color.WHITE);
        answer.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(20, 174, 115)));
        answer.setOnClickListener(view -> answerCall());

        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setTextSize(18);
        decline.setTextColor(Color.WHITE);
        decline.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(211, 54, 74)));
        decline.setOnClickListener(view -> finishCall());

        root.addView(label, matchWidth());
        root.addView(caller, matchWidth());
        root.addView(hint, matchWidth());
        root.addView(answer, buttonHeight());
        root.addView(decline, buttonHeight());
        setContentView(root);
    }

    private LinearLayout.LayoutParams matchWidth() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonHeight() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            64
        );
        params.setMargins(0, 12, 0, 12);
        return params;
    }

    private void answerCall() {
        String callUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        int notificationId = getIntent().getIntExtra(IncomingCallNotifier.EXTRA_NOTIFICATION_ID, 0);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(notificationId);
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
        finish();
    }

    private void finishCall() {
        int notificationId = getIntent().getIntExtra(IncomingCallNotifier.EXTRA_NOTIFICATION_ID, 0);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(notificationId);
        String callUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        if (callUrl != null) {
            Intent intent = new Intent(this, MainActivity.class)
                .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl + "&action=decline")
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
        finish();
    }
}
