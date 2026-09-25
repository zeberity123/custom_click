import test from 'node:test';
import assert from 'node:assert/strict';
import { TempoClock } from '../src/tempo-clock.js';
import { ExportRenderer, exportDuration, EXPORT_RATE } from '../src/export-renderer.js';

function hits(config, seconds) {
  const clock = new TempoClock(EXPORT_RATE,config), events = [];
  for (let frame = 0; frame < seconds * EXPORT_RATE; frame++) {
    const event = clock.frame(); if (event?.click) events.push({...event,time:frame/EXPORT_RATE});
  }
  return {clock,events};
}
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<=1/EXPORT_RATE+1e-9,`${actual} != ${expected}`);
test('bar automation changes only after completed bars, including compound meters', () => {
  for (const [numerator,denominator,barDuration] of [[4,4,2],[6,8,1.5],[7,8,1.75]]) {
    const {events} = hits({bpm:120,numerator,denominator,note:'eighth',automation:{enabled:true,delta:60,every:1,unit:'bars'}},4);
    const first = events.find(event=>event.bar===2 && event.beat===0);
    close(first.time,barDuration); assert.equal(first.bpm,180);
    const next = events[events.indexOf(first)+1]; close(next.time,barDuration+1/6);
  }
});
test('second automation preserves fractional musical phase and clips at tempo bounds', () => {
  const {events} = hits({bpm:90,note:'quarter',automation:{enabled:true,delta:60,every:1,unit:'seconds'}},2);
  close(events[0].time,0); close(events[1].time,2/3); close(events[2].time,1.2); close(events[3].time,1.6);
  assert.equal(hits({bpm:290,automation:{enabled:true,delta:40,every:1,unit:'seconds'}},3).clock.bpm,300);
  assert.equal(hits({bpm:20,automation:{enabled:true,delta:-40,every:1,unit:'seconds'}},3).clock.bpm,10);
});
test('volume and pan edits retain automation progress, reset and tempo edits restart it', () => {
  const {clock} = hits({bpm:120,automation:{enabled:true,delta:10,every:1,unit:'seconds'}},2.1);
  assert.equal(clock.bpm,140);
  const elapsed = clock.elapsed, remaining = clock.remaining;
  clock.configure({...clock.config,volume:42,pan:80});
  assert.equal(clock.elapsed,elapsed); assert.equal(clock.remaining,remaining); assert.equal(clock.bpm,140);
  clock.configure({...clock.config,bpm:100});
  assert.equal(clock.elapsed,0); assert.equal(clock.tick,0); assert.equal(clock.bpm,100);
  clock.frame(); clock.reset(); assert.equal(clock.elapsed,0); assert.equal(clock.bpm,100);
});
test('export length follows automation for both bars and seconds', () => {
  const config={bpm:120,automation:{enabled:true,delta:60,every:1,unit:'bars'}};
  close(exportDuration(config,3,'bars'),2+4/3+1);
  close(exportDuration({...config,automation:{enabled:true,delta:60,every:1,unit:'seconds'}},1,'bars'),1+2/3);
  assert.equal(exportDuration(config,10,'seconds'),10);
  assert.throws(()=>exportDuration(config,3601,'seconds'),/exportLimit/);
  assert.throws(()=>exportDuration({bpm:10},10000,'bars'),/exportLimit/);
  assert.throws(()=>exportDuration(config,0,'bars'),/exportInvalid/);
  assert.throws(()=>exportDuration(config,1.5,'bars'),/exportInvalid/);
});
test('export PCM matches automated playback hit times, rests, gain, pan, and exact duration', () => {
  const config={bpm:120,note:'triplet-skip',pan:-100,volume:100,automation:{enabled:true,delta:60,every:1,unit:'bars'}};
  const samples={high:new Float32Array([1]),low:new Float32Array([.5])};
  const renderer=new ExportRenderer(config,samples,2,'bars'), actual=[];
  while(renderer.frame<renderer.totalFrames) {
    const offset=renderer.frame, {left,right}=renderer.read(1024);
    assert.ok(right.every(value=>value===0));
    left.forEach((value,i)=>{if(value)actual.push({time:(offset+i)/EXPORT_RATE,value});});
  }
  const expected=hits(config,exportDuration(config,2,'bars')).events;
  assert.equal(actual.length,expected.length);
  actual.forEach((hit,i)=>{close(hit.time,expected[i].time);assert.equal(hit.value,Math.round((expected[i].high?1:.5)*.65*32767));});
  assert.equal(renderer.frame,Math.round((2+4/3)*EXPORT_RATE));
  const silent=new ExportRenderer({...config,volume:0},samples,1,'seconds');
  assert.ok(silent.read().left.every(value=>value===0));
});
