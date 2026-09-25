#include "../Click/RhythmDSP.hpp"
#include <cassert>
#include <iostream>

static void push(RhythmDSP &engine,int type,RhythmConfig config={}) { RhythmCommand c;c.type=type;c.config=config;assert(engine.commands.push(c)); }
int main() {
    for(int bpm:{10,126,300}) for(int note=0;note<8;note++) {
        RhythmDSP engine(48000,{1},{.5});RhythmConfig config;config.bpm=bpm;config.note=note;
        push(engine,0,config);push(engine,1);
        float left,right;int clicks=0;int64_t frames=int64_t(48000)*60*4/bpm;
        for(int64_t i=0;i<frames;i++) {
            engine.render(&left,&right,1);RhythmEvent event;
            while(engine.events.pop(event)) if(event.click) { clicks++;assert(left>0 && right>0); }
        }
        const int expected[]={1,2,4,8,16,12,8,8};assert(clicks==expected[note]);
        push(engine,2);engine.render(&left,&right,1);assert(left==0 && right==0 && !engine.playing);
        push(engine,3);push(engine,1);engine.render(&left,&right,1);
        RhythmEvent first;assert(engine.events.pop(first));assert(first.beat==0 && first.bar==1);
    }
    for(bool seconds:{false,true}) {
        RhythmDSP engine(48000,{1},{.5});RhythmConfig c;c.bpm=120;c.automation=true;c.seconds=seconds;c.every=1;c.delta=10;
        push(engine,0,c);push(engine,1);float left,right;
        const int boundary=seconds?48000:96000;
        for(int i=0;i<boundary;i++) engine.render(&left,&right,1);
        assert(engine.currentBpm==120);
        engine.render(&left,&right,1);assert(engine.currentBpm==130);
        push(engine,2);for(int i=0;i<48000;i++)engine.render(&left,&right,1);
        assert(engine.currentBpm==130);
        c.volume=0;push(engine,0,c);engine.render(&left,&right,1);assert(engine.currentBpm==130);
        push(engine,3);engine.render(&left,&right,1);assert(engine.currentBpm==120);
    }
    RhythmDSP engine(48000,std::vector<float>(2000,1),{.5});RhythmConfig c;c.pan=-100;
    push(engine,0,c);push(engine,1);float left,right;
    for(int i=0;i<2000;i++)engine.render(&left,&right,1);
    assert(left>right*30);
    Ring<int,3> ring;assert(ring.push(1));assert(ring.push(2));assert(!ring.push(3));int value;assert(ring.pop(value)&&value==1);assert(ring.push(3));assert(ring.pop(value)&&value==2);assert(ring.pop(value)&&value==3);assert(!ring.pop(value));
    std::cout<<"PASS: iOS DSP patterns at boundary tempos, automation boundaries, pause/reset, gain-only preservation, pan and command queue.\n";
}
