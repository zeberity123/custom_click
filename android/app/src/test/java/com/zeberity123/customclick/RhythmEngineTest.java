package com.zeberity123.customclick;

import java.util.ArrayList;
import java.util.List;

/** Runs on the host JDK; tests actual rendered PCM without an emulator. */
public class RhythmEngineTest {
    private static void check(boolean value, String message) { if(!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        RhythmEngine fresh = new RhythmEngine(new float[]{1}, new float[]{.5f}, (frame,beat,bar,start,click,high)->{});
        check(fresh.config().bpm == 126 && fresh.currentBpm() == 126, "factory tempo must be 126 BPM");
        check(fresh.config().note.equals("quarter") && java.util.Arrays.equals(fresh.config().accents,new boolean[]{true,false,false,false}), "factory rhythm must be quarter notes with only the first beat high");
        fresh.configure(new RhythmEngine.Config(176,4,4,"eighth",65,0,new boolean[]{true,true,true,true}));
        check(fresh.config().bpm == 176 && fresh.currentBpm() == 176, "saved tempo must override the factory default");
        String[] notes = {"whole","half","quarter","eighth","sixteenth","triplet","triplet-skip","sixteenth-skip"};
        for (int bpm : new int[]{10,176,250}) {
            for (String note : notes) {
                List<Long> frames = new ArrayList<>();
                RhythmEngine engine = new RhythmEngine(new float[]{1},new float[]{.5f},(frame,beat,bar,start,click,high)->{if(click) frames.add(frame);});
                engine.configure(new RhythmEngine.Config(bpm,4,4,note,100,-100,new boolean[]{true,true,true,true}));
                engine.start();
                int total = (int)(48000 * 60.0 / bpm * 4);
                float[] pcm = new float[960];
                int sounded = 0;
                for(int i=0;i<total;i+=480) {
                    int count = Math.min(480,total-i);
                    engine.render(pcm,count);
                    for(int j=0;j<count;j++) if(pcm[2*j]!=0) sounded++;
                }
                check(sounded == frames.size(),note+" unexpected audio during rest");
                List<Double> expected = new ArrayList<>();
                double quarter = 48000 * 60.0 / bpm;
                if(note.equals("triplet") || note.endsWith("-skip")) {
                    double[] hits = note.equals("triplet") ? new double[]{0,1.0/3,2.0/3} : note.equals("triplet-skip") ? new double[]{0,2.0/3} : new double[]{0,.75};
                    for(int beat=0;beat<4;beat++) for(double hit:hits) expected.add((beat+hit)*quarter);
                } else {
                    double division = switch(note) {case "whole"->4;case "half"->2;case "quarter"->1;case "eighth"->.5;default->.25;};
                    for(int i=0;i<4/division;i++) expected.add(i*division*quarter);
                }
                check(frames.size()==expected.size(),note+" wrong click count");
                for(int i=0;i<frames.size();i++) check(Math.abs(frames.get(i)-expected.get(i))<=1.00001,note+" drift at "+bpm+" BPM");
                engine.pause(); long before=frames.size();engine.render(pcm,480);
                check(frames.size()==before,"paused clock advanced");
                for(float sample:pcm) check(sample==0,"pause left audible samples");
                engine.reset();engine.start();engine.render(pcm,480);
                check(frames.size()>before,"reset did not restart");
            }
        }
        for(int pan:new int[]{-100,0,100}) {
            RhythmEngine engine=new RhythmEngine(new float[]{1},new float[]{1},null);
            engine.configure(new RhythmEngine.Config(120,4,4,"quarter",100,pan,new boolean[]{true,true,true,true}));
            float[] pcm=new float[960];for(int i=0;i<30;i++) engine.render(pcm,480);
            engine.preview(true);engine.render(pcm,480);
            if(pan==-100) check(Math.abs(pcm[1])<.00001 && pcm[0]>.6,"left pan");
            if(pan==100) check(Math.abs(pcm[0])<.00001 && pcm[1]>.6,"right pan");
            if(pan==0) check(Math.abs(pcm[0]-pcm[1])<.00001,"center pan");
            engine.configure(new RhythmEngine.Config(120,4,4,"quarter",0,pan,new boolean[]{true,true,true,true}));
            for(int i=0;i<30;i++) engine.render(pcm,480);
            engine.preview(true);engine.render(pcm,480);
            check(Math.abs(pcm[0])+Math.abs(pcm[1])<.00001,"mute");
        }
        for (String unit : new String[]{"bars","seconds"}) {
            List<Long> events = new ArrayList<>();
            RhythmEngine engine = new RhythmEngine(new float[]{1},new float[]{1},(frame,beat,bar,start,click,high)->{if(click)events.add(frame);});
            RhythmEngine.Config config = new RhythmEngine.Config(120,4,4,"quarter",100,-100,new boolean[]{true,true,true,true},true,60,1,unit);
            engine.configure(config); engine.start();
            float[] pcm = new float[960];
            for (int i=0;i<250;i++) engine.render(pcm,480);
            check(engine.currentBpm()==(unit.equals("bars")?180:240),"automated tempo: "+unit);
            double[] expected = unit.equals("bars") ? new double[]{0,.5,1,1.5,2,2+1.0/3} : new double[]{0,.5,1,1+1.0/3,1+2.0/3,2,2.25};
            check(events.size()==expected.length,"automated click count: "+unit);
            for(int i=0;i<expected.length;i++) check(Math.abs(events.get(i)-expected[i]*48000)<=1,"automation timing: "+unit);
            int tempo = engine.currentBpm(); engine.pause();
            for(int i=0;i<200;i++) engine.render(pcm,480);
            check(engine.currentBpm()==tempo,"pause advanced automation");
            engine.configure(config); check(engine.currentBpm()==tempo,"resume configuration reset automation");
            engine.reset(); check(engine.currentBpm()==120,"reset did not restore base tempo");
        }
        for(int delta:new int[]{100,-100}) {
            RhythmEngine engine = new RhythmEngine(new float[]{1},new float[]{1},null);
            engine.configure(new RhythmEngine.Config(120,6,8,"triplet-skip",100,0,new boolean[]{true},true,delta,1,"seconds"));
            engine.start(); float[] pcm=new float[960];
            for(int i=0;i<310;i++)engine.render(pcm,480);
            check(engine.currentBpm()==(delta>0?250:10),"tempo bound");
        }
        {   // Preset: change after this bar keeps tempo until the next downbeat.
            List<long[]> beats = new ArrayList<>();
            RhythmEngine[] ref = {null};
            RhythmEngine engine = new RhythmEngine(new float[]{1},new float[]{1},(frame,beat,bar,start,click,high)->{ if(start) beats.add(new long[]{frame,bar,beat,ref[0].currentBpm()}); });
            ref[0] = engine;
            engine.configure(new RhythmEngine.Config(120,4,4,"quarter",100,0,new boolean[]{true,true,true,true}));
            engine.start(); float[] pcm=new float[960];
            for(int i=0;i<60;i++) engine.render(pcm,480);  // 0.6 s at 120 BPM: beats 1-2 of bar 1 sounded
            check(beats.size()==2,"pre-change beats");
            engine.changeTempo(180,true,0);
            check(engine.currentBpm()==120 && engine.isRamping(),"atBar must wait");
            check(engine.config().bpm==180,"target stored in config");
            engine.configure(new RhythmEngine.Config(180,4,4,"quarter",100,0,new boolean[]{true,true,true,true}));
            check(engine.isRamping(),"matching config must not cancel the pending change");
            for(int i=0;i<300;i++) engine.render(pcm,480);
            long[] downbeat = beats.get(4);
            check(downbeat[1]==2 && downbeat[2]==0 && downbeat[3]==180,"bar 2 downbeat at new tempo");
            check(beats.get(3)[3]==120,"bar 1 beat 4 at old tempo");
            check(Math.abs(downbeat[0]-48000*2)<=1,"downbeat timing");
            check(Math.abs(beats.get(5)[0]-downbeat[0]-16000)<=1,"new beat length");
        }
        {   // Preset: gradual change glides over N bars, then lands exactly.
            RhythmEngine engine = new RhythmEngine(new float[]{1},new float[]{1},null);
            engine.configure(new RhythmEngine.Config(100,4,4,"quarter",100,0,new boolean[]{true,true,true,true}));
            engine.start(); float[] pcm=new float[960];
            engine.render(pcm,480);
            engine.changeTempo(200,false,2);
            double last = engine.exactBpm(); boolean rose=false;
            for(int i=0;i<1000 && engine.isRamping();i++){ engine.render(pcm,480); if(engine.exactBpm()>last) rose=true; check(engine.exactBpm()>=last,"ramp must be monotonic"); last=engine.exactBpm(); }
            check(rose && !engine.isRamping() && engine.currentBpm()==200 && engine.exactBpm()==200,"ramp lands on target");
            engine.changeTempo(90,false,8); engine.reset();
            check(!engine.isRamping() && engine.currentBpm()==90,"reset ends ramp at target");
        }
        System.out.println("PASS: native PCM timing, rests, pause/reset, pan/mute, bar/second automation, tempo bounds, and preset tempo changes.");
    }
}
