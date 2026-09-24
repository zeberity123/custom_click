export const PPQ = 48;
export const NOTES = { whole: 192, half: 96, quarter: 48, eighth: 24, sixteenth: 12 };
export const DEFAULTS = { bpm: 176, numerator: 4, denominator: 4, note: 'eighth', dotted: false, volume: 65, pan: 0, accents: [true, true, true, true] };

export function sanitize(input = {}) {
  const bounded = (x, fallback, min, max) => Number.isFinite(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : fallback;
  const numerator = Math.round(bounded(input.numerator ?? 4, 4, 1, 12));
  return {
    bpm: Math.round(bounded(input.bpm ?? 176, 176, 10, 300)),
    numerator,
    denominator: [2, 4, 8, 16].includes(Number(input.denominator)) ? Number(input.denominator) : 4,
    note: Object.hasOwn(NOTES, input.note) ? input.note : 'eighth',
    dotted: input.dotted === true,
    volume: bounded(input.volume ?? 65, 65, 0, 100),
    pan: bounded(input.pan ?? 0, 0, -100, 100),
    accents: Array.from({ length: numerator }, (_, i) => typeof input.accents?.[i] === 'boolean' ? input.accents[i] : true),
  };
}

export function tickEvent(tick, config) {
  const beatTicks = PPQ * 4 / config.denominator;
  const barTicks = beatTicks * config.numerator;
  const position = tick % barTicks;
  const clickTicks = NOTES[config.note] * (config.dotted ? 1.5 : 1);
  const beat = Math.floor(position / beatTicks);
  return {
    beat, bar: Math.floor(tick / barTicks) + 1,
    beatStart: position % beatTicks === 0,
    click: tick % clickTicks === 0,
    high: position % beatTicks === 0 && config.accents[beat],
  };
}

export class TapTempo {
  constructor() { this.times = []; }
  tap(now) {
    if (this.times.length && now - this.times.at(-1) > 6500) this.times = [];
    if (this.times.length && now - this.times.at(-1) < 100) return null;
    this.times.push(now);
    if (this.times.length > 6) this.times.shift();
    if (this.times.length < 2) return null;
    const interval = (this.times.at(-1) - this.times[0]) / (this.times.length - 1);
    return Math.max(10, Math.min(300, Math.round(60000 / interval)));
  }
}
