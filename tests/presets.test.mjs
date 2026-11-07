import test from 'node:test';
import assert from 'node:assert/strict';
import { TempoClock } from '../src/tempo-clock.js';
import { PPQ } from '../src/timing.js';

const RATE = 48000;
// Run until `predicate` matches a tick event; returns that event with its frame index.
function runUntil(clock, predicate, limit = RATE * 60) {
  for (let frame = 0; frame < limit; frame++) {
    const event = clock.frame();
    if (event && predicate(event)) return { ...event, frame };
  }
  throw new Error('event not reached');
}
const quarterTicks = PPQ, barTicks = PPQ * 4;

test('immediate preset change keeps the bar position and switches tempo on the next tick', () => {
  const clock = new TempoClock(RATE, { bpm: 120, note: 'quarter' });
  runUntil(clock, event => event.bar === 1 && event.beat === 2 && event.beatStart);
  const tick = clock.tick;
  clock.changeTempo(200);
  assert.equal(clock.tick, tick);
  assert.equal(clock.bpm, 200);
  assert.equal(clock.config.bpm, 200);
  assert.equal(clock.ramping, false);
  const next = runUntil(clock, event => event.beatStart);
  assert.equal(next.bar, 1); assert.equal(next.beat, 3); assert.equal(next.bpm, 200);
});

test('change after this bar holds the tempo until the next downbeat', () => {
  const clock = new TempoClock(RATE, { bpm: 120, note: 'quarter' });
  runUntil(clock, event => event.bar === 1 && event.beat === 1 && event.beatStart);
  clock.changeTempo(180, { atBar: true });
  assert.equal(clock.ramping, true);
  assert.equal(clock.bpm, 120);
  const beat3 = runUntil(clock, event => event.beat === 3 && event.beatStart);
  assert.equal(beat3.bpm, 120);
  const downbeat = runUntil(clock, event => event.beatStart);
  assert.equal(downbeat.bar, 2); assert.equal(downbeat.beat, 0); assert.equal(downbeat.bpm, 180);
  assert.equal(clock.ramping, false);
});

test('change after this bar at an untouched downbeat applies on that downbeat', () => {
  const clock = new TempoClock(RATE, { bpm: 120, note: 'quarter' });
  clock.changeTempo(90, { atBar: true });
  assert.equal(clock.bpm, 90);
  assert.equal(clock.ramping, false);
  const first = runUntil(clock, event => event.beatStart);
  assert.equal(first.bar, 1); assert.equal(first.bpm, 90);
});

test('gradual change glides linearly over the requested bars and lands exactly on the target', () => {
  const clock = new TempoClock(RATE, { bpm: 100, note: 'quarter' });
  runUntil(clock, event => event.beatStart);           // bar 1 beat 1 sounded
  clock.changeTempo(200, { bars: 2 });
  const seen = [];
  for (let frame = 0; frame < RATE * 10 && seen.length < 10; frame++) {
    const event = clock.frame();
    if (event?.beatStart) seen.push(event.bpm);
  }
  // The glide starts on the next tick and climbs every beat.
  for (let i = 1; i < 8; i++) assert.ok(seen[i] > seen[i - 1], `tempo did not rise: ${seen}`);
  assert.ok(Math.abs(seen[0] - (100 + 100 * (quarterTicks - 1) / (2 * barTicks))) < 1e-9);
  assert.equal(seen[8], 200);
  assert.equal(clock.ramping, false);
  assert.equal(clock.bpm, 200);
});

test('gradual change after this bar waits for the downbeat, then glides', () => {
  const clock = new TempoClock(RATE, { bpm: 150, note: 'quarter' });
  runUntil(clock, event => event.beat === 2 && event.beatStart);
  clock.changeTempo(120, { atBar: true, bars: 1 });
  const beat4 = runUntil(clock, event => event.beatStart);
  assert.equal(beat4.bpm, 150);
  const bar2 = runUntil(clock, event => event.beatStart);
  assert.equal(bar2.bar, 2); assert.equal(bar2.bpm, 150);   // ramp starts here (progress 0)
  const beats = [runUntil(clock, e => e.beatStart), runUntil(clock, e => e.beatStart), runUntil(clock, e => e.beatStart)];
  assert.deepEqual(beats.map(e => e.bpm), [142.5, 135, 127.5]);
  assert.equal(runUntil(clock, e => e.beatStart).bpm, 120);
});

test('playback timing follows the ramp: beat intervals shrink as tempo rises', () => {
  const clock = new TempoClock(RATE, { bpm: 60, note: 'quarter' });
  clock.changeTempo(120, { bars: 1 });
  const frames = [];
  for (let frame = 0; frame < RATE * 6 && frames.length < 6; frame++) if (clock.frame()?.beatStart) frames.push(frame);
  const gaps = frames.slice(1).map((frame, i) => frame - frames[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] < gaps[i - 1] || gaps[i] === RATE / 2, `${gaps}`);
  assert.ok(Math.abs(gaps.at(-1) - RATE / 2) <= 1);
});

test('preset changes compose with automation without restarting it', () => {
  const clock = new TempoClock(RATE, { bpm: 120, note: 'quarter', automation: { enabled: true, delta: 10, every: 1, unit: 'bars' } });
  runUntil(clock, event => event.bar === 2 && event.beatStart);
  assert.equal(clock.bpm, 130);
  clock.changeTempo(100);
  assert.equal(clock.bpm, 110);
  assert.equal(clock.steps, 1);
  // The UI then sends the same bpm in its config; this must not reset progress.
  const tick = clock.tick;
  clock.configure({ ...clock.config, bpm: 100 });
  assert.equal(clock.tick, tick);
  assert.equal(runUntil(clock, event => event.bar === 3 && event.beatStart).bpm, 120);
});

test('a later manual tempo edit or reset cancels a pending ramp', () => {
  const clock = new TempoClock(RATE, { bpm: 120, note: 'quarter' });
  runUntil(clock, event => event.beatStart);
  clock.changeTempo(200, { bars: 8 });
  clock.configure({ ...clock.config, bpm: 90 });
  assert.equal(clock.ramping, false); assert.equal(clock.bpm, 90);
  clock.changeTempo(200, { atBar: true });
  clock.reset();
  assert.equal(clock.ramping, false); assert.equal(clock.bpm, 200); assert.equal(clock.tick, 0);
});

test('preset targets are clamped to 10–250 BPM', () => {
  const clock = new TempoClock(RATE, { bpm: 120 });
  clock.changeTempo(300); assert.equal(clock.bpm, 250);
  clock.changeTempo(1); assert.equal(clock.bpm, 10);
  assert.equal(quarterTicks, 48);
});
