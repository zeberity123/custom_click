package com.zeberity123.customclick;

import java.util.ArrayList;

/** Pure sample-clock engine, independent of Android and UI timers. */
public final class RhythmEngine {
    public static final int RATE = 48000;
    public static final int PPQ = 48;
    public interface Listener { void event(long frame, int beat, long bar, boolean beatStart, boolean click, boolean high); }
    public static final class Config {
        public final int bpm, numerator, denominator;
        public final String note;
        public final float volume, pan;
        public final boolean[] accents;
        public final boolean automationEnabled;
        public final int automationDelta, automationEvery;
        public final String automationUnit;
        public Config(int bpm, int numerator, int denominator, String note, float volume, float pan, boolean[] accents) {
            this(bpm, numerator, denominator, note, volume, pan, accents, false, 5, 4, "bars");
        }
        public Config(int bpm, int numerator, int denominator, String note, float volume, float pan, boolean[] accents, boolean enabled, int delta, int every, String unit) {
            automationEnabled = enabled;
            automationDelta = Math.max(-100, Math.min(100, delta));
            automationEvery = Math.max(1, Math.min(3600, every));
            automationUnit = "seconds".equals(unit) ? "seconds" : "bars";
            this.bpm = Math.max(10, Math.min(300, bpm));
            this.numerator = Math.max(1, Math.min(12, numerator));
            this.denominator = denominator == 2 || denominator == 8 || denominator == 16 ? denominator : 4;
            this.note = switch(note) { case "whole", "half", "quarter", "eighth", "sixteenth", "triplet", "triplet-skip", "sixteenth-skip" -> note; default -> "eighth"; };
            this.volume = Float.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 65;
            this.pan = Float.isFinite(pan) ? Math.max(-100, Math.min(100, pan)) : 0;
            this.accents = new boolean[this.numerator];
            for (int i = 0; i < this.numerator; i++) this.accents[i] = i >= accents.length || accents[i];
        }
    }
    private static final class Voice {
        final float[] sample;
        int index;
        Voice(float[] sample) { this.sample = sample; }
    }
    private Config config = new Config(176, 4, 4, "eighth", 65, 0, new boolean[]{true,true,true,true});
    private final float[] high, low;
    private final ArrayList<Voice> voices = new ArrayList<>();
    private final Listener listener;
    private boolean running;
    private long tick, frames, elapsed, steps;
    private int currentBpm = 176;
    private double remaining;
    private float gain = .65f * .65f, pan;
    public RhythmEngine(float[] high, float[] low, Listener listener) { this.high = high; this.low = low; this.listener = listener; }
    public synchronized void configure(Config next) {
        boolean rhythm = config.numerator != next.numerator || config.denominator != next.denominator || !config.note.equals(next.note);
        boolean automation = config.automationEnabled != next.automationEnabled || config.automationDelta != next.automationDelta || config.automationEvery != next.automationEvery || !config.automationUnit.equals(next.automationUnit);
        if (rhythm || automation || (config.bpm != next.bpm && (config.automationEnabled || next.automationEnabled))) {
            tick = 0; remaining = 0; elapsed = 0; steps = 0; currentBpm = next.bpm;
        } else if (config.bpm != next.bpm) { remaining *= (double)currentBpm / next.bpm; currentBpm = next.bpm; }
        config = next;
    }
    public synchronized int currentBpm() { return currentBpm; }
    public synchronized Config config() { return config; }
    public synchronized void start() { running = true; }
    public synchronized void pause() { running = false; voices.clear(); }
    public synchronized void reset() { pause(); tick = 0; remaining = 0; elapsed = 0; steps = 0; currentBpm = config.bpm; }
    public synchronized boolean isRunning() { return running; }
    public synchronized boolean hasAudio() { return running || !voices.isEmpty(); }
    public synchronized long frames() { return frames; }
    public synchronized void resetOutputClock() { frames = 0; }
    public synchronized void preview(boolean accent) { if (voices.size() < 16) voices.add(new Voice(accent ? high : low)); }
    public static boolean isClick(long tick, String note) {
        int position = (int)(tick % PPQ);
        return switch(note) {
            case "triplet" -> position % 16 == 0;
            case "triplet-skip" -> position == 0 || position == 32;
            case "sixteenth-skip" -> position == 0 || position == 36;
            default -> tick % switch(note) { case "whole" -> 192; case "half" -> 96; case "quarter" -> 48; case "sixteenth" -> 12; default -> 24; } == 0;
        };
    }
    private void setStep(long step) {
        if (step == steps) return;
        steps = step;
        int next = (int)Math.max(10, Math.min(300, config.bpm + step * config.automationDelta));
        remaining *= (double)currentBpm / next;
        currentBpm = next;
    }
    public synchronized void render(float[] stereo, int count) {
        int beatTicks = PPQ * 4 / config.denominator;
        int barTicks = beatTicks * config.numerator;
        for (int i = 0; i < count; i++) {
            int previousBpm = currentBpm;
            if (running && config.automationEnabled && config.automationUnit.equals("seconds")) setStep(elapsed / ((long)config.automationEvery * RATE));
            if (running && remaining <= 1e-8) {
                if (config.automationEnabled && config.automationUnit.equals("bars")) setStep(tick / ((long)barTicks * config.automationEvery));
                int position = (int)(tick % barTicks);
                int beat = position / beatTicks;
                boolean beatStart = position % beatTicks == 0;
                boolean click = isClick(tick, config.note);
                boolean accent = beatStart && config.accents[beat];
                if (click) voices.add(new Voice(accent ? high : low));
                if ((beatStart || click || currentBpm != previousBpm) && listener != null) listener.event(frames, beat, tick / barTicks + 1, beatStart, click, accent);
                tick++;
                remaining += RATE * 60.0 / (currentBpm * PPQ);
            }
            else if (currentBpm != previousBpm && listener != null) listener.event(frames,0,tick/barTicks+1,false,false,false);
            if (running) { remaining--; elapsed++; }
            float sample = 0;
            for (int v = voices.size() - 1; v >= 0; v--) {
                Voice voice = voices.get(v);
                sample += voice.sample[voice.index++];
                if (voice.index == voice.sample.length) voices.remove(v);
            }
            gain += (config.volume / 100 * .65f - gain) * .002f;
            pan += (config.pan / 100 - pan) * .002f;
            double angle = (pan + 1) * Math.PI / 4;
            stereo[2*i] = (float)(sample * gain * Math.cos(angle));
            stereo[2*i+1] = (float)(sample * gain * Math.sin(angle));
            frames++;
        }
    }
}
