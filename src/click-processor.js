import { PPQ, tickEvent, sanitize } from './timing.js';

// All musical time advances here, on the audio rendering thread.
class ClickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.config = sanitize();
    this.samples = {};
    this.running = false;
    this.tick = 0;
    this.remaining = 0;
    this.voices = [];
    this.fade = 1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'samples') this.samples = data.samples;
      if (data.type === 'config') {
        const previous = this.config;
        this.config = sanitize(data.config);
        this.remaining *= previous.bpm / this.config.bpm;
        if (previous.numerator !== this.config.numerator || previous.denominator !== this.config.denominator || previous.note !== this.config.note) {
          this.tick = 0;
          this.remaining = 0;
        }
      }
      if (data.type === 'start') { this.running = true; this.fade = 1; }
      if (data.type === 'pause') { this.running = false; this.fade = 1; }
      if (data.type === 'reset') { this.running = false; this.tick = 0; this.remaining = 0; this.fade = 1; }
      if (data.type === 'preview') this.addVoice(data.high);
    };
  }
  addVoice(high) {
    const sample = this.samples[high ? 'high' : 'low'];
    if (sample) this.voices.push({ sample, index: 0, preview: !this.running });
  }
  process(inputs, outputs) {
    const output = outputs[0][0];
    const framesPerTick = sampleRate * 60 / (this.config.bpm * PPQ);
    for (let i = 0; i < output.length; i++) {
      if (this.running && this.remaining <= 0) {
        const event = tickEvent(this.tick, this.config);
        if (event.click) this.addVoice(event.high);
        if (event.beatStart || event.click) this.port.postMessage({ ...event, time: currentTime + i / sampleRate });
        this.tick++;
        this.remaining += framesPerTick;
      }
      if (this.running) this.remaining--;
      else this.fade = Math.max(0, this.fade - 1 / (sampleRate * .005));
      let value = 0;
      for (let v = this.voices.length - 1; v >= 0; v--) {
        const voice = this.voices[v];
        value += voice.sample[voice.index++] * (this.running || voice.preview ? 1 : this.fade);
        if (voice.index >= voice.sample.length || (!this.running && !voice.preview && this.fade === 0)) this.voices.splice(v, 1);
      }
      output[i] = value;
    }
    return true;
  }
}
registerProcessor('click-processor', ClickProcessor);
