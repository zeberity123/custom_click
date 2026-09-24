import test from 'node:test';
import assert from 'node:assert/strict';
import { tickEvent, sanitize, TapTempo, PPQ } from '../src/timing.js';

function clicks(config, ticks) {
  return Array.from({ length: ticks }, (_, i) => ({ tick: i, ...tickEvent(i, sanitize(config)) })).filter(event => event.click);
}
test('4/4 reference pattern is eight alternating high and low clicks', () => {
  const events = clicks({}, PPQ * 4);
  assert.equal(events.length, 8);
  assert.deepEqual(events.map(event => event.high), [true, false, true, false, true, false, true, false]);
  assert.deepEqual(events.map(event => event.beat), [0, 0, 1, 1, 2, 2, 3, 3]);
});
test('beat accents change only the selected beat, not offbeat subdivisions', () => {
  assert.deepEqual(clicks({ accents: [true, false, true, false] }, 192).map(event => event.high), [true, false, false, false, true, false, false, false]);
});
test('6/8 counts six eighth-note beats per bar at quarter-note BPM', () => {
  const events = clicks({ numerator: 6, denominator: 8 }, 144);
  assert.deepEqual(events.map(event => event.beat), [0, 1, 2, 3, 4, 5]);
  assert.equal(tickEvent(144, sanitize({ numerator: 6, denominator: 8 })).bar, 2);
});
test('whole, half, quarter, eighth, and sixteenth notes have musical durations', () => {
  for (const [note, count] of [['whole', 1], ['half', 2], ['quarter', 4], ['eighth', 8], ['sixteenth', 16]]) {
    assert.equal(clicks({ note }, 192).length, count);
  }
});
test('dotted notes retain their duration across bar lines', () => {
  assert.deepEqual(clicks({ note: 'quarter', dotted: true }, 400).map(event => event.tick), [0, 72, 144, 216, 288, 360]);
  assert.deepEqual(clicks({ note: 'whole', numerator: 3 }, 400).map(event => event.tick), [0, 192, 384]);
});
test('invalid saved settings are sanitized; custom meter supports 1–12 beats', () => {
  const settings = sanitize({ bpm: 999, numerator: -7, denominator: 3, note: 'invalid', pan: -300, volume: 'x', accents: ['false'] });
  assert.equal(settings.bpm, 300);
  assert.equal(settings.numerator, 1);
  assert.equal(settings.denominator, 4);
  assert.equal(settings.note, 'eighth');
  assert.equal(settings.pan, -100);
  assert.equal(settings.volume, 65);
  assert.deepEqual(settings.accents, [true]);
  assert.equal(sanitize({ bpm: -1 }).bpm, 10);
});
test('tap tempo averages intervals, rejects bounce, and resets after inactivity', () => {
  const tap = new TapTempo();
  assert.equal(tap.tap(0), null);
  assert.equal(tap.tap(20), null);
  assert.equal(tap.tap(500), 120);
  assert.equal(tap.tap(1000), 120);
  assert.equal(tap.tap(9000), null);
  assert.equal(tap.tap(15000), 10);
  const fast = new TapTempo();
  fast.tap(0);
  assert.equal(fast.tap(200), 300);
});
