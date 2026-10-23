package com.sbryms.finance;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class IncomingCallActivity extends Activity {
    private float answerTouchStartY;

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
        String callerName = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_TITLE);
        String callType = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_TYPE);
        boolean video = "video".equals(callType);

        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] { Color.rgb(8, 20, 31), Color.rgb(12, 27, 40), Color.rgb(3, 11, 20) }
        ));

        TextView name = new TextView(this);
        name.setText(callerName == null ? "SBRYMS member" : callerName);
        name.setTextColor(Color.WHITE);
        name.setTextSize(26);
        name.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        name.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams nameParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL
        );
        nameParams.setMargins(dp(24), dp(82), dp(24), 0);
        root.addView(name, nameParams);

        TextView callInfo = new TextView(this);
        callInfo.setText(video ? "Incoming video call" : "Incoming audio call");
        callInfo.setTextColor(Color.rgb(179, 193, 205));
        callInfo.setTextSize(15);
        callInfo.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams infoParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL
        );
        infoParams.setMargins(dp(24), dp(122), dp(24), 0);
        root.addView(callInfo, infoParams);

        TextView avatar = new TextView(this);
        avatar.setText(initials(callerName));
        avatar.setTextColor(Color.WHITE);
        avatar.setTextSize(44);
        avatar.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable avatarBackground = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] { Color.rgb(52, 194, 163), Color.rgb(33, 104, 151) }
        );
        avatarBackground.setShape(GradientDrawable.OVAL);
        avatarBackground.setStroke(dp(3), 0x66FFFFFF);
        avatar.setBackground(avatarBackground);
        FrameLayout.LayoutParams avatarParams = new FrameLayout.LayoutParams(dp(172), dp(172), Gravity.CENTER);
        avatarParams.bottomMargin = dp(12);
        root.addView(avatar, avatarParams);

        TextView hint = new TextView(this);
        hint.setText("Swipe up to answer");
        hint.setTextColor(Color.rgb(205, 214, 222));
        hint.setTextSize(14);
        hint.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams hintParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        hintParams.setMargins(dp(20), 0, dp(20), dp(132));
        root.addView(hint, hintParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams actionsParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        actionsParams.setMargins(dp(14), 0, dp(14), dp(28));
        root.addView(actions, actionsParams);

        actions.addView(createAction(
            "Decline",
            Color.rgb(231, 0, 59),
            android.R.drawable.sym_action_call,
            135,
            this::finishCall
        ), actionWeight());

        FrameLayout answer = createAction(
            "Answer",
            Color.rgb(25, 171, 103),
            android.R.drawable.sym_action_call,
            0,
            null
        );
        answer.setContentDescription("Swipe up to answer the call");
        answer.setOnClickListener(view -> answerCall());
        answer.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    answerTouchStartY = event.getRawY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float distance = event.getRawY() - answerTouchStartY;
                    view.setTranslationY(Math.max(-dp(72), Math.min(0, distance)));
                    if (distance < -dp(28)) hint.setText("Release to answer");
                    return true;
                case MotionEvent.ACTION_UP:
                    float swipeDistance = event.getRawY() - answerTouchStartY;
                    view.animate().translationY(0).setDuration(140).start();
                    if (swipeDistance <= -dp(64)) {
                        view.performClick();
                    } else {
                        hint.setText("Swipe up to answer");
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    view.animate().translationY(0).setDuration(140).start();
                    hint.setText("Swipe up to answer");
                    return true;
                default:
                    return true;
            }
        });
        actions.addView(answer, actionWeight());

        FrameLayout message = createMessageAction();
        message.setOnClickListener(view -> openMessages());
        actions.addView(message, actionWeight());

        setContentView(root);
    }

    private FrameLayout createAction(
        String label,
        int color,
        int iconResource,
        float rotation,
        Runnable action
    ) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);

        FrameLayout circle = new FrameLayout(this);
        circle.setBackground(circleBackground(color));
        circle.setContentDescription(label);
        ImageView icon = new ImageView(this);
        icon.setImageResource(iconResource);
        icon.setColorFilter(Color.WHITE);
        icon.setRotation(rotation);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dp(32), dp(32), Gravity.CENTER);
        circle.addView(icon, iconParams);
        item.addView(circle, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView caption = new TextView(this);
        caption.setText(label);
        caption.setTextColor(Color.rgb(199, 207, 217));
        caption.setTextSize(12);
        caption.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        captionParams.topMargin = dp(8);
        item.addView(caption, captionParams);

        if (action != null) {
            circle.setOnClickListener(view -> action.run());
            item.setOnClickListener(view -> action.run());
        }
        return wrapActionItem(item);
    }

    private FrameLayout wrapActionItem(LinearLayout item) {
        FrameLayout wrapper = new FrameLayout(this);
        wrapper.addView(item, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ));
        return wrapper;
    }

    private FrameLayout createMessageAction() {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);

        TextView icon = new TextView(this);
        icon.setText("\u2026");
        icon.setTextColor(Color.WHITE);
        icon.setTextSize(32);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(circleBackground(Color.rgb(43, 54, 64)));
        item.addView(icon, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView caption = new TextView(this);
        caption.setText("Message");
        caption.setTextColor(Color.rgb(199, 207, 217));
        caption.setTextSize(12);
        caption.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        captionParams.topMargin = dp(8);
        item.addView(caption, captionParams);

        FrameLayout wrapper = wrapActionItem(item);
        wrapper.setContentDescription("Open chat");
        return wrapper;
    }

    private GradientDrawable circleBackground(int color) {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(color);
        return background;
    }

    private LinearLayout.LayoutParams actionWeight() {
        return new LinearLayout.LayoutParams(0, dp(112), 1);
    }

    private String initials(String name) {
        if (name == null || name.trim().isEmpty()) return "S";
        String[] parts = name.trim().split("\\s+");
        StringBuilder result = new StringBuilder(parts[0].substring(0, 1));
        if (parts.length > 1) result.append(parts[parts.length - 1].substring(0, 1));
        return result.toString().toUpperCase(java.util.Locale.ROOT);
    }

    private void answerCall() {
        dismissCallNotification();
        String callUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
        finish();
    }

    private void finishCall() {
        dismissCallNotification();
        String callUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
        if (callUrl != null) {
            Intent intent = new Intent(this, MainActivity.class)
                .putExtra(IncomingCallNotifier.EXTRA_CALL_URL, callUrl + "&action=decline")
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
        finish();
    }

    private void openMessages() {
        String chatUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CHAT_URL);
        if (chatUrl == null || chatUrl.trim().isEmpty()) {
            String callUrl = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_URL);
            chatUrl = callUrl == null ? "team-meet.html" : callUrl.replaceFirst("team-meet-call\\.html", "team-meet-chat.html");
        }
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra(IncomingCallNotifier.EXTRA_TARGET_URL, chatUrl)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
        finish();
    }

    private void dismissCallNotification() {
        int notificationId = getIntent().getIntExtra(IncomingCallNotifier.EXTRA_NOTIFICATION_ID, 0);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(notificationId);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
