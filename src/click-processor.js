import { sanitize } from './timing.js';
import { TempoClock } from './tempo-clock.js';

// All musical time advances here, on the audio rendering thread.
class ClickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.config = sanitize();
    this.clock = new TempoClock(sampleRate, this.config);
    this.samples = {};
    this.running = false;
    this.tick = 0;
    this.remaining = 0;
    this.voices = [];
    this.fade = 1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'samples') this.samples = data.samples;
      if (data.type === 'config') {
        this.config = sanitize(data.config);
        this.clock.configure(this.config);
        this.tick = this.clock.tick;
        this.remaining = this.clock.remaining;
      }
      if (data.type === 'start') { this.running = true; this.fade = 1; }
      if (data.type === 'pause') { this.running = false; this.fade = 1; }
      if (data.type === 'reset') { this.running = false; this.clock.reset(); this.tick = 0; this.remaining = 0; this.fade = 1; }
      if (data.type === 'preview') this.addVoice(data.high);
    };
  }
  addVoice(high) {
    const sample = this.samples[high ? 'high' : 'low'];
    if (sample) this.voices.push({ sample, index: 0, preview: !this.running });
  }
  process(inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      const previousBpm = this.clock.bpm;
      const event = this.running ? this.clock.frame() : null;
      const tempoChanged = this.clock.bpm !== previousBpm;
      if (event) {
        if (event.click) this.addVoice(event.high);
        if (event.beatStart || event.click || tempoChanged) this.port.postMessage({ ...event, time: currentTime + i / sampleRate });
      }
      else if (tempoChanged) this.port.postMessage({ bpm:this.clock.bpm, time:currentTime + i/sampleRate });
      this.tick = this.clock.tick;
      this.remaining = this.clock.remaining;
      if (!this.running) this.fade = Math.max(0, this.fade - 1 / (sampleRate * .005));
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
