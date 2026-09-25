// WKWebView sends control messages; the native render thread owns musical timing.
export class IOSAudio {
  constructor(onEvent) {
    this.state = { config: {}, playing: false };
    this.pending = Promise.resolve();
    window.addEventListener('ios-clicks', ({ detail }) => {
      for (const event of detail) onEvent({ ...event, time: performance.now() / 1000 });
    });
    window.addEventListener('native-state', ({ detail }) => { this.state = detail; });
  }
  async init() { this.state = await window.IOSClick.call('ready'); }
  enqueue(command, payload) {
    this.pending = this.pending.then(() => window.IOSClick.call(command, payload)).catch(error => {
      window.dispatchEvent(new CustomEvent('native-state', { detail: { playing: false, error: error.message || String(error) } }));
    });
  }
  configure(config) { this.enqueue('configure', { config }); }
  send(type, extra = {}) { this.enqueue('command', { type, high: extra.high === true }); }
  audibleTime() { return performance.now() / 1000; }
  snapshot() { return this.state; }
}
