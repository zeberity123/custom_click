import { PPQ, sanitize, tickEvent } from './timing.js';

// Shared by real-time playback and offline export. Only rendered frames advance time.
export class TempoClock {
  constructor(rate, config) { this.rate = rate; this.config = sanitize(config); this.reset(); }
  reset() { this.tick = 0; this.remaining = 0; this.elapsed = 0; this.steps = 0; this.bpm = this.config.bpm; }
  configure(input) {
    const next = sanitize(input), previous = this.config;
    const rhythmChanged = ['numerator', 'denominator', 'note'].some(key => next[key] !== previous[key]);
    const automationChanged = JSON.stringify(next.automation) !== JSON.stringify(previous.automation);
    this.config = next;
    if (rhythmChanged || automationChanged || (next.bpm !== previous.bpm && (next.automation.enabled || previous.automation.enabled))) this.reset();
    else if (next.bpm !== previous.bpm) { this.remaining *= this.bpm / next.bpm; this.bpm = next.bpm; }
  }
  setStep(step) {
    if (step === this.steps) return;
    this.steps = step;
    const next = Math.max(10, Math.min(300, this.config.bpm + step * this.config.automation.delta));
    this.remaining *= this.bpm / next;
    this.bpm = next;
  }
  frame() {
    const a = this.config.automation;
    if (a.enabled && a.unit === 'seconds') this.setStep(Math.floor(this.elapsed / (a.every * this.rate)));
    let event;
    if (this.remaining <= 1e-8) {
      if (a.enabled && a.unit === 'bars') this.setStep(Math.floor(this.tick / (PPQ * 4 / this.config.denominator * this.config.numerator * a.every)));
      event = { ...tickEvent(this.tick++, this.config), bpm: this.bpm };
      this.remaining += this.rate * 60 / (this.bpm * PPQ);
    }
    this.remaining--;
    this.elapsed++;
    return event;
  }
}
