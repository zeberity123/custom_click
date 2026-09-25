package com.zeberity123.customclick;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.nio.*;

public final class MetronomeService extends Service {
    public static final String PLAY = "click.PLAY", PAUSE = "click.PAUSE", STOP = "click.STOP";
    private static final String CHANNEL = "metronome";
    private static final int NOTIFICATION = 39;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LocalBinder binder = new LocalBinder();
    private RhythmEngine engine;
    private volatile boolean alive = true, foreground;
    private volatile String error = "";
    private AudioManager manager;
    private AudioFocusRequest focus;
    private PowerManager.WakeLock wake;
    private MediaSession session;
    private Thread worker;
    private final Object signal = new Object();
    private volatile AudioTrack track;
    private int notifiedBpm = -1;
    private final BroadcastReceiver noisy = new BroadcastReceiver() { public void onReceive(Context c, Intent intent) { pause(); } };
    public final class LocalBinder extends Binder { public MetronomeService getService() { return MetronomeService.this; } }
    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public void onCreate() {
        super.onCreate();
        manager = (AudioManager)getSystemService(AUDIO_SERVICE);
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes()).setOnAudioFocusChangeListener(change -> {
            if (change < 0) { pause(); emitState("Audio focus lost. Tap Resume when you are ready."); }
        }, main).build();
        wake = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CustomClick:audio");
        wake.setReferenceCounted(false);
        refreshLanguage();
        session = new MediaSession(this, "Custom Click");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { startForegroundService(new Intent(MetronomeService.this, MetronomeService.class).setAction(PLAY)); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { reset(); }
        });
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(noisy, filter);
        try {
            engine = new RhythmEngine(loadSample("click-high.wav"), loadSample("click-low.wav"), this::beatEvent);
            JSONObject saved = new JSONObject(getSharedPreferences("audio",0).getString("config", "{}"));
            JSONObject automation = saved.optJSONObject("automation");
            if (automation != null) automation.put("enabled", false);
            configure(saved.toString());
            worker = new Thread(this::audioLoop, "Click-Audio");
            worker.start();
        } catch (Exception failure) { error = "Could not initialize audio: " + failure.getMessage(); }
    }
    private AudioAttributes attributes() { return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build(); }
    private String text(String en, String ko, String ja) {
        return switch(getSharedPreferences("ui",0).getString("language","en")) { case "ko" -> ko; case "ja" -> ja; default -> en; };
    }
    public void refreshLanguage() {
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,text("Metronome playback","메트로놈 재생","メトロノーム再生"),NotificationManager.IMPORTANCE_LOW));
        if (foreground) getSystemService(NotificationManager.class).notify(NOTIFICATION,notification());
    }
    private float[] loadSample(String name) throws IOException {
        byte[] bytes;
        try (InputStream input = getAssets().open("web/assets/" + name); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192]; int read;
            while ((read = input.read(chunk)) != -1) output.write(chunk,0,read);
            bytes = output.toByteArray();
        }
        ByteBuffer data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        if (data.getInt(24) != RhythmEngine.RATE || data.getShort(22) != 1 || data.getShort(34) != 16) throw new IOException("Expected mono 48 kHz 16-bit PCM.");
        for (int offset = 12; offset + 8 <= bytes.length;) {
            int size = data.getInt(offset + 4);
            if (data.getInt(offset) == 0x61746164) {
                if (size <= 0 || offset + 8L + size > bytes.length) throw new IOException("Invalid WAV data.");
                float[] sample = new float[size / 2];
                for (int i = 0; i < sample.length; i++) sample[i] = data.getShort(offset + 8 + i*2) / 32768f;
                return sample;
            }
            if (size < 0) break;
            offset += 8 + size + size % 2;
        }
        throw new IOException("Missing WAV data.");
    }
    public void configure(String json) {
        if (engine == null) return;
        try {
            JSONObject value = new JSONObject(json);
            JSONArray input = value.optJSONArray("accents");
            boolean[] accents = new boolean[input == null ? 0 : Math.min(12,input.length())];
            for (int i=0;i<accents.length;i++) accents[i] = input.optBoolean(i,true);
            JSONObject automation = value.optJSONObject("automation");
            if (automation == null) automation = new JSONObject();
            engine.configure(new RhythmEngine.Config(value.optInt("bpm",RhythmEngine.DEFAULT_BPM), value.optInt("numerator",4), value.optInt("denominator",4), value.optString("note","eighth"), (float)value.optDouble("volume",65), (float)value.optDouble("pan",0), accents, automation.optBoolean("enabled",false), automation.optInt("delta",5), automation.optInt("every",4), automation.optString("unit","bars")));
            getSharedPreferences("audio",0).edit().putString("config", configJson().toString()).apply();
            main.post(() -> { if (foreground) getSystemService(NotificationManager.class).notify(NOTIFICATION, notification()); });
        } catch (JSONException failure) { error = "Invalid metronome settings."; }
    }
    private JSONObject configJson() {
        JSONObject json = new JSONObject();
        if (engine == null) return json;
        RhythmEngine.Config config = engine.config();
        try {
            json.put("bpm",config.bpm).put("numerator",config.numerator).put("denominator",config.denominator).put("note",config.note).put("volume",config.volume).put("pan",config.pan);
            JSONArray accents = new JSONArray(); for(boolean accent:config.accents) accents.put(accent);
            json.put("accents",accents);
            json.put("automation",new JSONObject().put("enabled",config.automationEnabled).put("delta",config.automationDelta).put("every",config.automationEvery).put("unit",config.automationUnit));
        } catch(JSONException ignored) { }
        return json;
    }
    public JSONObject snapshot() {
        JSONObject json = new JSONObject();
        try { json.put("playing",engine != null && engine.isRunning()).put("config",configJson()).put("currentBpm",engine == null ? RhythmEngine.DEFAULT_BPM : engine.currentBpm()).put("error",error); } catch(JSONException ignored) { }
        return json;
    }
    private void emitState(String message) {
        JSONObject json = snapshot();
        try { json.put("message",message); } catch(JSONException ignored) { }
        MainActivity.emit("native-state",json);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? STOP : intent.getAction();
        if (PLAY.equals(action)) {
            startForeground(NOTIFICATION,notification()); foreground = true;
            if (engine == null || !error.isEmpty() || manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                pause(); emitState(error.isEmpty() ? "Audio output is in use. Try again." : error);
            } else {
                if (!wake.isHeld()) wake.acquire();
                engine.start(); wakeWorker(); session.setActive(true); updateMediaState(true); emitState("");
            }
        } else if (PAUSE.equals(action)) pause(); else reset();
        return START_NOT_STICKY;
    }
    public void pause() {
        if (engine != null) engine.pause();
        manager.abandonAudioFocusRequest(focus);
        if (wake.isHeld()) wake.release();
        updateMediaState(false); session.setActive(false);
        stopForeground(STOP_FOREGROUND_REMOVE); foreground = false; stopSelf(); emitState("");
    }
    public void reset() { if (engine != null) engine.reset(); pause(); }
    private void wakeWorker() { synchronized(signal) { signal.notifyAll(); } }
    public void preview(boolean high) { if (engine != null && error.isEmpty()) { engine.preview(high); wakeWorker(); } }
    private void updateMediaState(boolean running) {
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP).setState(running ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1).build());
    }
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pause = PendingIntent.getService(this,1,new Intent(this,MetronomeService.class).setAction(PAUSE),PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int bpm = engine == null ? RhythmEngine.DEFAULT_BPM : engine.currentBpm();
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setColor(0xff39c5bb).setContentTitle("Click · " + bpm + " BPM").setContentText(text("Metronome is playing","메트로놈 재생 중","メトロノーム再生中")).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause,text("Pause","일시정지","一時停止"),pause).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0)).build();
    }
    private void beatEvent(long frame, int beat, long bar, boolean beatStart, boolean click, boolean high) {
        int bpm = engine.currentBpm();
        if (bpm != notifiedBpm) {
            notifiedBpm = bpm;
            main.post(() -> { if (foreground) getSystemService(NotificationManager.class).notify(NOTIFICATION,notification()); });
        }
        AudioTrack output = track;
        double time = System.nanoTime() / 1e9;
        if (output != null) {
            AudioTimestamp stamp = new AudioTimestamp();
            if (output.getTimestamp(stamp)) time = stamp.nanoTime / 1e9 + (frame - stamp.framePosition) / (double)RhythmEngine.RATE;
            else time += Math.max(0, frame - (output.getPlaybackHeadPosition() & 0xffffffffL)) / (double)RhythmEngine.RATE;
        }
        JSONObject event = new JSONObject();
        try { event.put("bpm",engine.currentBpm()).put("time",time).put("beat",beat).put("bar",bar).put("beatStart",beatStart).put("click",click).put("high",high); } catch(JSONException ignored) { }
        MainActivity.emit("native-click",event);
    }
    private void audioLoop() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO);
        float[] buffer = new float[480 * 2];
        boolean outputPlaying = false;
        try {
            int minimum = AudioTrack.getMinBufferSize(RhythmEngine.RATE,AudioFormat.CHANNEL_OUT_STEREO,AudioFormat.ENCODING_PCM_FLOAT);
            track = new AudioTrack.Builder().setAudioAttributes(attributes()).setAudioFormat(new AudioFormat.Builder().setSampleRate(RhythmEngine.RATE).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build()).setBufferSizeInBytes(Math.max(minimum,480*2*4*2)).setTransferMode(AudioTrack.MODE_STREAM).setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY).build();
            if (track.getState() != AudioTrack.STATE_INITIALIZED) throw new IOException("No audio output device.");
            while (alive) {
                if (!engine.hasAudio()) {
                    if (outputPlaying) {
                        // Drain a preview's quiet tail before stopping the output clock.
                        Thread.sleep(30);
                        if (engine.hasAudio()) continue;
                        track.pause(); track.flush(); track.stop(); outputPlaying = false;
                    }
                    synchronized(signal) { while(alive && !engine.hasAudio()) signal.wait(); }
                    continue;
                }
                if (!outputPlaying) { engine.resetOutputClock(); track.play(); outputPlaying = true; }
                engine.render(buffer,480);
                int offset = 0;
                while (alive && offset < buffer.length) {
                    int count = track.write(buffer,offset,buffer.length-offset,AudioTrack.WRITE_BLOCKING);
                    if (count < 0) throw new IOException("Audio device disconnected (" + count + ").");
                    offset += count;
                }
            }
        } catch(InterruptedException ignored) { }
        catch(Exception failure) { error = failure.getMessage(); main.post(() -> { pause(); emitState(error); }); }
        finally { AudioTrack output=track; track=null; if(output!=null) output.release(); }
    }
    @Override public void onTaskRemoved(Intent rootIntent) { reset(); }
    @Override public void onDestroy() {
        alive=false;
        wakeWorker();
        if (engine != null) engine.pause();
        if (worker != null) worker.interrupt();
        manager.abandonAudioFocusRequest(focus);
        if (wake.isHeld()) wake.release();
        session.release(); unregisterReceiver(noisy);
        super.onDestroy();
    }
}
