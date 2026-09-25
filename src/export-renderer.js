import { sanitize } from './timing.js';
import { TempoClock } from './tempo-clock.js';

export const EXPORT_RATE = 48000;
export const MAX_EXPORT_SECONDS = 3600;
export function exportDuration(input, length, unit) {
  const config = sanitize(input);
  if (!Number.isInteger(length) || length < 1 || length > 10000 || !['bars', 'seconds'].includes(unit)) throw new Error('exportInvalid');
  let seconds = 0;
  if (unit === 'seconds') seconds = length;
  else {
    let quarters = length * config.numerator * 4 / config.denominator, step = 0;
    const a = config.automation;
    while (quarters > 1e-9) {
      const bpm = Math.max(10, Math.min(300, config.bpm + (a.enabled ? step * a.delta : 0)));
      const span = !a.enabled ? quarters : a.unit === 'bars' ? a.every * config.numerator * 4 / config.denominator : a.every * bpm / 60;
      const consumed = Math.min(quarters, span);
      seconds += consumed * 60 / bpm;
      quarters -= consumed; step++;
      if (seconds > MAX_EXPORT_SECONDS + 1e-7) throw new Error('exportLimit');
    }
  }
  if (seconds > MAX_EXPORT_SECONDS) throw new Error('exportLimit');
  return seconds;
}

export function decodeSample(buffer) {
  const data = new DataView(buffer);
  if (data.getUint32(24, true) !== EXPORT_RATE || data.getUint16(22, true) !== 1 || data.getUint16(34, true) !== 16) throw new Error('Invalid PCM sample');
  for (let offset = 12; offset + 8 <= data.byteLength;) {
    const size = data.getUint32(offset + 4, true);
    if (data.getUint32(offset, true) === 0x61746164) {
      const pcm = new Float32Array(size / 2);
      for (let i = 0; i < pcm.length; i++) pcm[i] = data.getInt16(offset + 8 + i * 2, true) / 32768;
      return pcm;
    }
    offset += 8 + size + size % 2;
  }
  throw new Error('Invalid PCM sample');
}

export class ExportRenderer {
  constructor(input, samples, length, unit) {
    this.config = sanitize(input);
    this.clock = new TempoClock(EXPORT_RATE, this.config);
    this.totalFrames = Math.round(exportDuration(this.config, length, unit) * EXPORT_RATE);
    this.samples = samples; this.voices = []; this.frame = 0;
    const angle = (this.config.pan / 100 + 1) * Math.PI / 4, gain = this.config.volume / 100 * .65;
    this.left = gain * Math.cos(angle); this.right = gain * Math.sin(angle);
  }
  read(count = 1152) {
    count = Math.min(count, this.totalFrames - this.frame);
    const left = new Int16Array(count), right = new Int16Array(count);
    for (let i = 0; i < count; i++, this.frame++) {
      const event = this.clock.frame();
      if (event?.click) this.voices.push({ sample: this.samples[event.high ? 'high' : 'low'], index: 0 });
      let value = 0;
      for (let v = this.voices.length - 1; v >= 0; v--) {
        const voice = this.voices[v]; value += voice.sample[voice.index++];
        if (voice.index >= voice.sample.length) this.voices.splice(v, 1);
      }
      value *= Math.min(1, (this.totalFrames - 1 - this.frame) / (EXPORT_RATE * .005));
      left[i] = Math.round(Math.max(-1, Math.min(1, value * this.left)) * 32767);
      right[i] = Math.round(Math.max(-1, Math.min(1, value * this.right)) * 32767);
    }
    return { left, right };
  }
}
