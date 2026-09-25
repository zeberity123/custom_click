import { t } from './i18n.js';
export class ClickAudio {
  constructor(onEvent, onState) {
    this.onEvent = onEvent;
    this.onState = onState;
  }
  async init() {
    if (!this.loading) this.loading = this.load().catch(async error => {
      await this.context?.close().catch(() => {});
      this.loading = null;
      throw error;
    });
    await this.loading;
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error(t('Audio output is unavailable. Check your output device and try again.'));
  }
  async load() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.context.onstatechange = () => this.onState?.(this.context.state);
    await this.context.audioWorklet.addModule('./click-processor.js');
    this.node = new AudioWorkletNode(this.context, 'click-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const samples = {};
    for (const pitch of ['high', 'low']) {
      const response = await fetch(`./assets/click-${pitch}.wav`);
      if (!response.ok) throw new Error(t('Could not load click samples.'));
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      samples[pitch] = buffer.getChannelData(0);
    }
    this.node.port.postMessage({ type: 'samples', samples });
    this.node.port.onmessage = ({ data }) => this.onEvent(data);
    this.gain = this.context.createGain();
    this.panner = this.context.createStereoPanner();
    this.node.connect(this.gain).connect(this.panner).connect(this.context.destination);
    this.samples = samples;
  }
  configure(config) {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'config', config });
    // Headroom for overlapping click tails at fast sixteenth-note tempos.
    this.gain.gain.setTargetAtTime(config.volume / 100 * .65, this.context.currentTime, .01);
    this.panner.pan.setTargetAtTime(config.pan / 100, this.context.currentTime, .01);
  }
  send(type, extra = {}) { this.node?.port.postMessage({ type, ...extra }); }
  audibleTime() {
    const stamp = this.context?.getOutputTimestamp();
    if (stamp?.contextTime > 0) return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
    return (this.context?.currentTime ?? 0) - (this.context?.outputLatency ?? .02);
  }
}
