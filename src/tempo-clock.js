import { PPQ, sanitize, tickEvent, clampBpm } from './timing.js';

// Shared by real-time playback and offline export. Only rendered frames advance time.
// `base` is the user tempo (moved by presets and ramps); automation steps are added on top of it.
export class TempoClock {
  constructor(rate, config) { this.rate = rate; this.config = sanitize(config); this.reset(); }
  reset() { this.tick = 0; this.remaining = 0; this.elapsed = 0; this.steps = 0; this.ramp = null; this.base = this.config.bpm; this.bpm = this.config.bpm; }
  barTicks() { return PPQ * 4 / this.config.denominator * this.config.numerator; }
  configure(input) {
    const next = sanitize(input), previous = this.config;
    const rhythmChanged = ['numerator', 'denominator', 'note'].some(key => next[key] !== previous[key]);
    const automationChanged = JSON.stringify(next.automation) !== JSON.stringify(previous.automation);
    this.config = next;
    if (rhythmChanged || automationChanged || (next.bpm !== previous.bpm && (next.automation.enabled || previous.automation.enabled))) this.reset();
    else if (next.bpm !== previous.bpm) { this.ramp = null; this.base = next.bpm; this.retune(); }
  }
  // Preset tempo change during playback. Never resets the bar position or automation progress.
  // atBar: wait for the next downbeat. bars > 0: glide linearly over that many bars.
  changeTempo(target, { atBar = false, bars = 0 } = {}) {
    const to = clampBpm(Math.round(Number(target)));
    if (!Number.isFinite(to)) return;
    this.config = { ...this.config, bpm: to };
    const barTicks = this.barTicks();
    const length = Math.max(0, Math.round(Number(bars) || 0)) * barTicks;
    const start = atBar ? Math.ceil(this.tick / barTicks) * barTicks : this.tick;
    if (!length && start === this.tick) { this.ramp = null; this.base = to; this.retune(); return; }
    this.ramp = { from: this.base, to, start, length };
  }
  get ramping() { return this.ramp !== null; }
  applyRamp() {
    const ramp = this.ramp;
    if (!ramp || this.tick < ramp.start) return;
    const progress = ramp.length ? Math.min(1, (this.tick - ramp.start) / ramp.length) : 1;
    this.base = ramp.from + (ramp.to - ramp.from) * progress;
    if (progress >= 1) { this.base = ramp.to; this.ramp = null; }
    this.retune();
  }
  retune() {
    const a = this.config.automation;
    const next = clampBpm(this.base + (a.enabled ? this.steps * a.delta : 0));
    if (next === this.bpm) return;
    this.remaining *= this.bpm / next;
    this.bpm = next;
  }
  setStep(step) {
    if (step === this.steps) return;
    this.steps = step;
    this.retune();
  }
  frame() {
    const a = this.config.automation;
    if (a.enabled && a.unit === 'seconds') this.setStep(Math.floor(this.elapsed / (a.every * this.rate)));
    let event;
    if (this.remaining <= 1e-8) {
      if (a.enabled && a.unit === 'bars') this.setStep(Math.floor(this.tick / (this.barTicks() * a.every)));
      this.applyRamp();
      event = { ...tickEvent(this.tick++, this.config), bpm: this.bpm };
      this.remaining += this.rate * 60 / (this.bpm * PPQ);
    }
    this.remaining--;
    this.elapsed++;
    return event;
  }
}
