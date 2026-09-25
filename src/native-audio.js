// Android keeps musical timing in AudioTrack, including while the WebView sleeps.
import { t } from './i18n.js';
export class NativeAudio {
  constructor(onEvent) {
    this.samples = {};
    window.addEventListener('native-click', event => onEvent(event.detail));
  }
  async init() {
    const deadline = performance.now() + 5000;
    while (!window.NativeClick.ready()) {
      if (performance.now() > deadline) throw new Error(t('Android audio service did not start. Reopen the app and try again.'));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const state = this.snapshot();
    if (state.error) throw new Error(t(state.error));
    if (!this.loading) this.loading = Promise.all(['high', 'low'].map(async pitch => {
      const response = await fetch(`./assets/click-${pitch}.wav`);
      if (!response.ok) throw new Error(t('Could not load click samples.'));
      const data = new DataView(await response.arrayBuffer());
      let offset = 12;
      while (offset + 8 <= data.byteLength) {
        const size = data.getUint32(offset + 4, true);
        if (data.getUint32(offset, true) === 0x61746164) {
          const sample = new Float32Array(size / 2);
          for (let i = 0; i < sample.length; i++) sample[i] = data.getInt16(offset + 8 + i * 2, true) / 32768;
          this.samples[pitch] = sample; return;
        }
        offset += 8 + size + size % 2;
      }
      throw new Error(t('Invalid click sample.'));
    })).catch(error => { this.loading = null; throw error; });
    await this.loading;
  }
  configure(config) { window.NativeClick.configure(JSON.stringify(config)); }
  send(type, extra = {}) { window.NativeClick.command(type, extra.high === true); }
  audibleTime() { return window.NativeClick.clock(); }
  snapshot() { return JSON.parse(window.NativeClick.snapshot()); }
}
