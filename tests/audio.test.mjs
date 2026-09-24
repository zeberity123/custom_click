import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sanitize } from '../src/timing.js';

let Processor;
globalThis.AudioWorkletProcessor = class { constructor() { this.events = []; this.port = { postMessage: message => this.events.push(message) }; } };
globalThis.registerProcessor = (_, implementation) => { Processor = implementation; };
globalThis.sampleRate = 48000;
globalThis.currentTime = 0;
await import('../src/click-processor.js');
function send(processor, data) { processor.port.onmessage({ data }); }
function render(processor, seconds, startFrame = 0) {
  const block = new Float32Array(128);
  for (let frame = startFrame; frame < startFrame + seconds * sampleRate; frame += 128) {
    globalThis.currentTime = frame / sampleRate;
    processor.process([], [[block]]);
  }
  return block;
}
test('audio-thread timing stays within one sample over a minute at boundary tempos', () => {
  for (const bpm of [10, 176, 300]) {
    const processor = new Processor();
    send(processor, { type: 'config', config: sanitize({ bpm, note: 'sixteenth' }) });
    send(processor, { type: 'start' });
    render(processor, 60);
    const clicks = processor.events.filter(event => event.click);
    assert.ok(Math.abs(clicks.length - bpm * 4) <= 1);
    clicks.forEach((event, i) => assert.ok(Math.abs(event.time - i * 60 / bpm / 4) <= 1 / sampleRate + 1e-10, `${bpm} BPM drift at click ${i}`));
  }
});
test('pause stops output and musical time; reset restarts on beat one', () => {
  const processor = new Processor();
  send(processor, { type: 'samples', samples: { high: new Float32Array(5760).fill(.5), low: new Float32Array(5760).fill(.2) } });
  send(processor, { type: 'start' });
  render(processor, .2);
  const tick = processor.tick;
  send(processor, { type: 'pause' });
  const output = render(processor, .2);
  assert.equal(processor.tick, tick);
  assert.ok(output.every(value => value === 0));
  send(processor, { type: 'reset' });
  send(processor, { type: 'start' });
  processor.events.length = 0;
  render(processor, .01);
  assert.equal(processor.events[0].beat, 0);
  assert.equal(processor.events[0].bar, 1);
});
test('meter changes restart the bar and tempo changes keep the fractional phase', () => {
  const processor = new Processor();
  send(processor, { type: 'start' });
  render(processor, .1);
  const remaining = processor.remaining;
  send(processor, { type: 'config', config: sanitize({ bpm: 88 }) });
  assert.equal(processor.remaining, remaining * 2);
  send(processor, { type: 'config', config: sanitize({ bpm: 88, numerator: 3 }) });
  assert.equal(processor.remaining, 0);
  assert.equal(processor.tick, 0);
});
test('packaged waveforms exactly match extracted source PCM hashes', () => {
  const provenance = JSON.parse(readFileSync(new URL('../src/assets/provenance.json', import.meta.url)));
  for (const pitch of ['high', 'low']) {
    const wav = readFileSync(new URL(`../src/assets/click-${pitch}.wav`, import.meta.url));
    assert.equal(wav.readUInt32LE(24), 48000);
    assert.equal(wav.readUInt16LE(22), 1);
    const pcm = wav.subarray(44);
    assert.equal(pcm.length, provenance.samples[pitch].frames * 2);
    assert.equal(createHash('sha256').update(pcm).digest('hex'), provenance.samples[pitch].pcmSha256);
  }
});
