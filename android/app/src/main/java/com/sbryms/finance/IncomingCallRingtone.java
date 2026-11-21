package com.sbryms.finance;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.util.Log;
import java.io.IOException;
import android.os.Handler;
import android.os.Looper;

final class IncomingCallRingtone {
    private static final String TAG = "IncomingCallRingtone";
    private static final String PREFS = "call_ringtone";
    private static final String PREF_KEY = "selected";
    private static MediaPlayer player;
    private static ToneGenerator toneGenerator;
    private static String activeCallId = "";
    private static AudioManager audioManager;
    private static AudioManager.OnAudioFocusChangeListener focusChangeListener;
    private static AudioFocusRequest audioFocusRequest;
    private static Handler toneHandler;
    private static Runnable toneSequence;

    private IncomingCallRingtone() {}

    static synchronized void setSelected(Context context, String ringtone) {
        if (!isSupported(ringtone)) throw new IllegalArgumentException("Unsupported call ringtone.");
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_KEY, ringtone)
            .apply();
    }

    static synchronized void start(Context context, String callId) {
        stop(context, "");
        String ringtone = selectedRingtone(context);
        if ("dj-jazz-2".equals(ringtone)) {
            startJazzTone(context, callId, true);
            return;
        }
        startPlayer(context, callId, ringtone, true);
    }

    static synchronized void preview(Context context, String ringtone) {
        stop(context, "");
        if (ringtone != null) setSelected(context, ringtone);
        else {
            ringtone = selectedRingtone(context);
        }
        if ("dj-jazz-2".equals(ringtone)) {
            startJazzTone(context, "", false);
        } else {
            startPlayer(context, "", ringtone, false);
        }
    }

    static synchronized void stop(Context context, String callId) {
        if (callId != null && !callId.isEmpty() && !activeCallId.isEmpty()
            && !callId.equals(activeCallId)) return;
        if (player != null) {
            player.setOnCompletionListener(null);
            player.release();
            player = null;
        }
        if (toneHandler != null && toneSequence != null) toneHandler.removeCallbacks(toneSequence);
        toneSequence = null;
        toneHandler = null;
        if (toneGenerator != null) {
            toneGenerator.release();
            toneGenerator = null;
        }
        activeCallId = "";
        abandonAudioFocus();
    }

    private static void startJazzTone(Context context, String callId, boolean looping) {
        AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) return;
        requestAudioFocus(context);
        try {
            toneGenerator = new ToneGenerator(AudioManager.STREAM_RING, 80);
            activeCallId = callId == null ? "" : callId;
            toneHandler = new Handler(Looper.getMainLooper());
            int[] notes = {
                ToneGenerator.TONE_DTMF_1,
                ToneGenerator.TONE_DTMF_4,
                ToneGenerator.TONE_DTMF_6,
                ToneGenerator.TONE_DTMF_8,
                ToneGenerator.TONE_DTMF_6
            };
            toneSequence = new Runnable() {
                private int index;

                @Override
                public void run() {
                    if (toneGenerator == null) return;
                    if (index >= notes.length) {
                        if (!looping) {
                            stop(context, "");
                            return;
                        }
                        index = 0;
                        toneHandler.postDelayed(this, 650);
                        return;
                    }
                    toneGenerator.startTone(notes[index++], 165);
                    toneHandler.postDelayed(this, 220);
                }
            };
            toneHandler.post(toneSequence);
        } catch (RuntimeException error) {
            Log.e(TAG, "Could not start the built-in SBRYMS call ringtone.", error);
            stop(context, callId);
        }
    }

    private static void startPlayer(Context context, String callId, String ringtone, boolean looping) {
        String asset = "uploaded-2".equals(ringtone)
            ? "public/assets/ringtone-upload-2.mp3"
            : "public/assets/ringtone-upload-1.mp3";
        MediaPlayer nextPlayer = new MediaPlayer();
        try (AssetFileDescriptor descriptor = context.getAssets().openFd(asset)) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            nextPlayer.setAudioAttributes(attributes);
            nextPlayer.setDataSource(
                descriptor.getFileDescriptor(),
                descriptor.getStartOffset(),
                descriptor.getLength()
            );
            nextPlayer.setLooping(looping);
            nextPlayer.setOnErrorListener((failedPlayer, what, extra) -> {
                synchronized (IncomingCallRingtone.class) {
                    if (player == failedPlayer) stop(context, callId);
                }
                Log.w(TAG, "Incoming call ringtone playback failed: " + what + "/" + extra);
                return true;
            });
            if (!looping) {
                nextPlayer.setOnCompletionListener(completed -> {
                    synchronized (IncomingCallRingtone.class) {
                        if (player == completed) stop(context, "");
                    }
                });
            }
            nextPlayer.prepare();
            requestAudioFocus(context);
            player = nextPlayer;
            activeCallId = callId == null ? "" : callId;
            nextPlayer.start();
        } catch (IOException | RuntimeException error) {
            nextPlayer.release();
            Log.e(TAG, "Could not start the configured SBRYMS ringtone.", error);
        }
    }

    private static boolean isSupported(String ringtone) {
        return "dj-jazz-2".equals(ringtone)
            || "uploaded-1".equals(ringtone)
            || "uploaded-2".equals(ringtone);
    }

    private static String selectedRingtone(Context context) {
        String ringtone = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(PREF_KEY, "uploaded-1");
        if (isSupported(ringtone)) return ringtone;
        setSelected(context, "uploaded-1");
        return "uploaded-1";
    }

    private static void requestAudioFocus(Context context) {
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;
        focusChangeListener = focusChange -> {
            if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                stop(context, "");
            }
        };
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            )
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
                .setOnAudioFocusChangeListener(focusChangeListener)
                .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_RING,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            );
        }
    }

    private static void abandonAudioFocus() {
        if (audioManager == null || focusChangeListener == null) return;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        } else {
            audioManager.abandonAudioFocus(focusChangeListener);
        }
        focusChangeListener = null;
        audioManager = null;
    }
}
