#import "ClickAudio.h"
#import <AVFoundation/AVFoundation.h>
#include "RhythmDSP.hpp"
#include <memory>

@implementation ClickAudio {
    AVAudioEngine *_engine;
    AVAudioSourceNode *_source;
    std::unique_ptr<RhythmDSP> _dsp;
    NSDictionary *_config;
}
- (BOOL)prepare:(NSError **)error {
    if(!_engine) {
        std::vector<float> samples[2];
        for(int i=0;i<2;i++) {
            NSURL *url=[[NSBundle mainBundle] URLForResource:i==0?@"click-high":@"click-low" withExtension:@"wav" subdirectory:@"web/assets"];
            if(!url) { if(error) *error=[NSError errorWithDomain:@"Click" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Missing click samples"}]; return NO; }
            AVAudioFile *file=[[AVAudioFile alloc] initForReading:url error:error];
            if(!file) return NO;
            // Bundled mono PCM is 48 kHz; AVAudioEngine converts output for other hardware rates.
            if(file.processingFormat.sampleRate!=48000 || file.processingFormat.channelCount!=1) return NO;
            AVAudioPCMBuffer *buffer=[[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat frameCapacity:(AVAudioFrameCount)file.length];
            if(![file readIntoBuffer:buffer error:error]) return NO;
            samples[i].assign(buffer.floatChannelData[0],buffer.floatChannelData[0]+buffer.frameLength);
        }
        _dsp=std::make_unique<RhythmDSP>(48000,std::move(samples[0]),std::move(samples[1]));
        _engine=[AVAudioEngine new];
        AVAudioFormat *format=[[AVAudioFormat alloc] initStandardFormatWithSampleRate:48000 channels:2];
        RhythmDSP *dsp=_dsp.get();
        _source=[[AVAudioSourceNode alloc] initWithFormat:format renderBlock:^OSStatus(BOOL *silent,const AudioTimeStamp *stamp,AVAudioFrameCount count,AudioBufferList *buffers) {
            dsp->render((float *)buffers->mBuffers[0].mData,(float *)buffers->mBuffers[1].mData,count);
            *silent=NO;return noErr;
        }];
        [_engine attachNode:_source];[_engine connect:_source to:_engine.mainMixerNode format:format];
        [_engine prepare];
    }
    if(!_engine.running) return [_engine startAndReturnError:error];
    return YES;
}
- (BOOL)configure:(NSDictionary *)json {
    if(!_dsp) return NO;
    RhythmConfig c;
    c.bpm=std::clamp([json[@"bpm"] intValue],10,300);
    c.numerator=std::clamp([json[@"numerator"] intValue],1,12);
    int d=[json[@"denominator"] intValue];c.denominator=(d==2||d==8||d==16)?d:4;
    NSArray *notes=@[@"whole",@"half",@"quarter",@"eighth",@"sixteenth",@"triplet",@"triplet-skip",@"sixteenth-skip"];
    NSUInteger note=[notes indexOfObject:json[@"note"]?:@"eighth"];c.note=note==NSNotFound?3:(int)note;
    c.volume=std::clamp([json[@"volume"] floatValue],0.f,100.f);c.pan=std::clamp([json[@"pan"] floatValue],-100.f,100.f);
    NSArray *accents=json[@"accents"];for(int i=0;i<c.numerator;i++) c.accents[i]=i>=accents.count || [accents[i] boolValue];
    NSDictionary *a=json[@"automation"];
    c.automation=[a[@"enabled"] boolValue];c.delta=std::clamp([a[@"delta"] intValue],-100,100);c.every=std::clamp([a[@"every"] intValue],1,3600);c.seconds=[a[@"unit"] isEqual:@"seconds"];
    RhythmCommand command;command.config=c;
    if(!_dsp->commands.push(command)) return NO;
    _config=[json copy];return YES;
}
- (BOOL)command:(NSString *)type high:(BOOL)high {
    if(!_dsp) return NO;
    NSArray *names=@[@"config",@"start",@"pause",@"reset",@"preview"];
    NSUInteger index=[names indexOfObject:type];if(index==NSNotFound||index==0) return NO;
    RhythmCommand command;command.type=(int)index;command.high=high;return _dsp->commands.push(command);
}
- (NSDictionary *)snapshot {
    return @{ @"config":_config?:@{}, @"currentBpm":@(_dsp?_dsp->currentBpm.load():126), @"playing":@(_dsp && _dsp->playing.load()) };
}
- (NSArray<NSDictionary *> *)drainEvents {
    NSMutableArray *result=[NSMutableArray new];if(!_dsp) return result;
    RhythmEvent event;
    while(_dsp->events.pop(event)) [result addObject:@{@"beat":@(event.beat),@"bar":@(event.bar),@"bpm":@(event.bpm),@"beatStart":@(event.beatStart),@"click":@(event.click),@"high":@(event.high)}];
    return result;
}
- (void)stopOutput { [_engine stop]; }
- (void)dealloc { [_engine stop]; }
@end
