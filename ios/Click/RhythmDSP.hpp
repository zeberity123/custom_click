#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <vector>

// One producer (main thread), one consumer (audio render thread); no render locks or allocations.
template<class T, size_t N> class Ring {
    std::array<T,N> data{};
    std::atomic<size_t> read{0}, write{0};
public:
    bool push(const T &value) {
        auto w=write.load(std::memory_order_relaxed), next=(w+1)%N;
        if(next==read.load(std::memory_order_acquire)) return false;
        data[w]=value; write.store(next,std::memory_order_release); return true;
    }
    bool pop(T &value) {
        auto r=read.load(std::memory_order_relaxed);
        if(r==write.load(std::memory_order_acquire)) return false;
        value=data[r]; read.store((r+1)%N,std::memory_order_release); return true;
    }
};
struct RhythmConfig {
    int bpm=126, numerator=4, denominator=4, note=2; // whole, half, quarter, eighth, sixteenth, triplets, sparse patterns
    float volume=65, pan=0;
    std::array<bool,12> accents{true};
    bool automation=false, seconds=false;
    int delta=5, every=4;
};
struct RhythmEvent { int beat=0; int64_t bar=1; int bpm=126; bool beatStart=false, click=false, high=false; };
struct RhythmCommand { int type=0; RhythmConfig config; bool high=false; }; // config/start/pause/reset/preview
class RhythmDSP {
    struct Voice { int index=-1; bool high=false; };
    std::array<Voice,32> voices{};
    std::vector<float> highSample, lowSample;
    RhythmConfig config;
    double rate, remaining=0;
    int64_t tick=0, elapsed=0, steps=0;
    int bpm=126;
    bool running=false;
    float gain=.65f*.65f, pan=0;
    void clearVoices() { for(auto &v:voices) v.index=-1; }
    void resetClock() { tick=elapsed=steps=0; remaining=0; bpm=config.bpm; }
    void preview(bool high) { for(auto &v:voices) if(v.index<0) { v={0,high}; break; } }
    void configure(const RhythmConfig &next) {
        bool reset=config.numerator!=next.numerator || config.denominator!=next.denominator || config.note!=next.note ||
          config.automation!=next.automation || config.seconds!=next.seconds || config.delta!=next.delta || config.every!=next.every ||
          (config.bpm!=next.bpm && (config.automation || next.automation));
        if(!reset && config.bpm!=next.bpm) { remaining*=double(bpm)/next.bpm; bpm=next.bpm; }
        config=next;
        if(reset) resetClock();
    }
    void step(int64_t value) {
        if(value==steps) return;
        steps=value;
        int next=int(std::clamp<int64_t>(config.bpm+steps*config.delta,10,300));
        remaining*=double(bpm)/next; bpm=next;
    }
public:
    Ring<RhythmCommand,256> commands;
    Ring<RhythmEvent,1024> events;
    std::atomic<int> currentBpm{126};
    std::atomic<bool> playing{false};
    explicit RhythmDSP(double sampleRate, std::vector<float> high, std::vector<float> low):highSample(std::move(high)),lowSample(std::move(low)),rate(sampleRate) {}
    static bool isClick(int64_t t,int note) {
        const int p=int(t%48);
        if(note==5) return p%16==0;
        if(note==6) return p==0 || p==32;
        if(note==7) return p==0 || p==36;
        const int divisions[]={192,96,48,24,12};
        return t%divisions[std::clamp(note,0,4)]==0;
    }
    void render(float *left,float *right,unsigned count) {
        RhythmCommand command;
        while(commands.pop(command)) {
            switch(command.type) {
                case 0:configure(command.config);break;
                case 1:running=true;break;
                case 2:running=false;clearVoices();break;
                case 3:running=false;clearVoices();resetClock();break;
                case 4:preview(command.high);break;
            }
        }
        const int beatTicks=192/config.denominator, barTicks=beatTicks*config.numerator;
        const double smoothing=1-std::exp(-1/(rate*.01));
        for(unsigned i=0;i<count;i++) {
            int previousBpm=bpm;
            if(running && config.automation && config.seconds) step(int64_t(elapsed/(config.every*rate)));
            if(running && remaining<=1e-8) {
                if(config.automation && !config.seconds) step(tick/(int64_t(barTicks)*config.every));
                int pos=int(tick%barTicks), beat=pos/beatTicks;
                bool beatStart=pos%beatTicks==0, click=isClick(tick,config.note), high=beatStart && config.accents[beat];
                if(click) preview(high);
                if(beatStart || click || previousBpm!=bpm) events.push({beat,tick/barTicks+1,bpm,beatStart,click,high});
                tick++; remaining+=rate*60/(bpm*48);
            } else if(previousBpm!=bpm) events.push({0,tick/barTicks+1,bpm,false,false,false});
            if(running) { remaining--;elapsed++; }
            float sample=0;
            for(auto &v:voices) if(v.index>=0) {
                const auto &samples=v.high?highSample:lowSample;
                if(size_t(v.index)<samples.size()) sample+=samples[v.index++];
                if(size_t(v.index)>=samples.size()) v.index=-1;
            }
            gain+=(config.volume/100*.65f-gain)*smoothing;
            pan+=(config.pan/100-pan)*smoothing;
            const double angle=(pan+1)*3.141592653589793/4;
            left[i]=sample*gain*std::cos(angle);right[i]=sample*gain*std::sin(angle);
        }
        currentBpm.store(bpm,std::memory_order_relaxed);
        playing.store(running,std::memory_order_relaxed);
    }
};
