package com.sbryms.finance;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

final class StartupTune {
    private static final String TAG = "StartupTune";
    private static final int SAMPLE_RATE = 22050;
    private static final double[] NOTES_HZ = {523.25, 659.25, 783.99, 1046.50};
    private static final int NOTE_MS = 150;
    private static final int GAP_MS = 36;

    private StartupTune() {}

    static void play(Context context) {
        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null
            || audioManager.getRingerMode() != AudioManager.RINGER_MODE_NORMAL
            || audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) return;

        Thread player = new Thread(StartupTune::playTune, "sbryms-startup-tune");
        player.setDaemon(true);
        player.start();
    }

    private static void playTune() {
        AudioTrack track = null;
        try {
            short[] samples = createTuneSamples();
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build();
            track = new AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(format)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(samples.length * 2)
                .build();
            track.setVolume(0.55f);
            int written = track.write(samples, 0, samples.length, AudioTrack.WRITE_BLOCKING);
            if (written != samples.length) {
                throw new IllegalStateException("Only part of the startup tune could be loaded.");
            }
            track.play();
            long durationMs = samples.length * 1000L / SAMPLE_RATE;
            Thread.sleep(durationMs + 80);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException error) {
            Log.w(TAG, "Startup tune could not be played.", error);
        } finally {
            if (track != null) {
                track.pause();
                track.flush();
                track.release();
            }
        }
    }

    private static short[] createTuneSamples() {
        int noteSamples = SAMPLE_RATE * NOTE_MS / 1000;
        int gapSamples = SAMPLE_RATE * GAP_MS / 1000;
        short[] output = new short[NOTES_HZ.length * (noteSamples + gapSamples)];
        int offset = 0;
        for (double frequency : NOTES_HZ) {
            for (int sample = 0; sample < noteSamples; sample++) {
                double progress = sample / (double) noteSamples;
                double envelope = Math.min(1.0, Math.min(progress * 16.0, (1.0 - progress) * 12.0));
                double fundamental = Math.sin(2.0 * Math.PI * frequency * sample / SAMPLE_RATE);
                double overtone = Math.sin(4.0 * Math.PI * frequency * sample / SAMPLE_RATE) * 0.12;
                output[offset++] = (short) ((fundamental + overtone) * envelope * 4600);
            }
            offset += gapSamples;
        }
        return output;
    }
}
