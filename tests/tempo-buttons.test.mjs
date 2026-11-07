import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTempoButton } from '../src/tempo-buttons.js';

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const button = new EventTarget(), changes = [];
  let capture;
  const emit = (type, properties = {}, target = button) => {
    const event = Object.assign(new Event(type, { cancelable: true }), properties);
    target.dispatchEvent(event);
    return event;
  };
  button.setPointerCapture = id => { capture = id; };
  button.hasPointerCapture = id => capture === id;
  button.releasePointerCapture = id => { capture = null; emit('lostpointercapture', { pointerId: id }); };
  button.getBoundingClientRect = () => ({ left: 0, top: 0, right: 44, bottom: 44 });
  button.closest = () => null;
  setupTempoButton(button, delta => changes.push(delta));
  const down = (properties = {}) => emit('pointerdown', { isPrimary: true, button: 0, pointerId: 1, ...properties });
  return { button, changes, emit, down, tick: ms => t.mock.timers.tick(ms) };
}

test('tempo tap changes one BPM without an extra release click; Shift changes ten', t => {
  const f = fixture(t);
  f.down(); f.tick(200); f.emit('pointerup', { pointerId: 1 }); f.emit('click', { detail: 1 });
  f.tick(1000);
  assert.deepEqual(f.changes, [1]);
  f.down({ shiftKey: true }); f.emit('pointerup', { pointerId: 1 }); f.emit('click', { detail: 1 });
  assert.deepEqual(f.changes, [1, 10]);
});

test('tempo hold starts at 400 ms and repeats ten BPM every 250 ms', t => {
  const f = fixture(t);
  f.down(); f.tick(399); assert.deepEqual(f.changes, [1]);
  f.tick(1); assert.deepEqual(f.changes, [1, 10]);
  f.tick(249); assert.deepEqual(f.changes, [1, 10]);
  f.tick(1); f.tick(250); assert.deepEqual(f.changes, [1, 10, 10, 10]);
  f.emit('pointerup', { pointerId: 1 }); f.emit('click', { detail: 1 }); f.tick(1000);
  assert.deepEqual(f.changes, [1, 10, 10, 10]);
});

test('tempo repeat stops on cancellation, lost capture, leaving the button, or focus loss', t => {
  const f = fixture(t);
  for (const [type, properties, target] of [
    ['pointercancel', { pointerId: 1 }], ['lostpointercapture', { pointerId: 1 }],
    ['pointermove', { pointerId: 1, clientX: 60, clientY: 20 }],
    ['blur', {}, f.button], ['blur', {}, window], ['pagehide', {}, window],
  ]) {
    f.down(); f.tick(400);
    const count = f.changes.length;
    f.emit(type, properties, target); f.tick(1000);
    assert.equal(f.changes.length, count, type);
  }
  f.down(); document.hidden = true; f.emit('visibilitychange', {}, document);
  const count = f.changes.length; f.tick(1000); assert.equal(f.changes.length, count);
});

test('tempo hold ignores secondary touches and stops if its controls become inert', t => {
  const f = fixture(t);
  f.down({ isPrimary: false }); f.down({ button: 2 }); assert.deepEqual(f.changes, []);
  f.down(); f.down({ pointerId: 2 }); assert.deepEqual(f.changes, [1]);
  f.emit('pointerup', { pointerId: 2 }); f.tick(400); assert.deepEqual(f.changes, [1, 10]);
  f.button.closest = () => ({}); f.tick(250); f.tick(1000); assert.deepEqual(f.changes, [1, 10]);
});

test('keyboard hold uses the same cadence and does not depend on OS key repeat', t => {
  const f = fixture(t);
  assert.equal(f.emit('keydown', { key: ' ' }).defaultPrevented, true);
  f.emit('keydown', { key: ' ', repeat: true }); f.tick(400); f.tick(250);
  assert.deepEqual(f.changes, [1, 10, 10]);
  f.emit('keyup', { key: ' ' }); f.tick(1000);
  assert.deepEqual(f.changes, [1, 10, 10]);
  f.emit('click', { detail: 0 }); assert.deepEqual(f.changes, [1, 10, 10, 1]);
});
