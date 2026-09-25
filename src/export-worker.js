// The encoder stays a separate, unmodified LGPL library.
importScripts('./vendor/lame.min.js');
self.onmessage = async ({ data }) => {
  try {
    const { ExportRenderer, decodeSample, EXPORT_RATE } = await import('./export-renderer.js');
    const samples = {};
    for (const pitch of ['high', 'low']) {
      const response = await fetch(`./assets/click-${pitch}.wav`);
      if (!response.ok) throw new Error('sampleError');
      samples[pitch] = decodeSample(await response.arrayBuffer());
    }
    const renderer = new ExportRenderer(data.config, samples, data.length, data.unit);
    const encoder = new lamejs.Mp3Encoder(2, EXPORT_RATE, 192);
    const chunks = []; let lastProgress = -1;
    while (renderer.frame < renderer.totalFrames) {
      const { left, right } = renderer.read();
      const bytes = encoder.encodeBuffer(left, right);
      if (bytes.length) chunks.push(new Uint8Array(bytes));
      const progress = Math.floor(renderer.frame / renderer.totalFrames * 100);
      if (progress !== lastProgress) { self.postMessage({ progress }); lastProgress = progress; }
    }
    const final = encoder.flush();
    if (final.length) chunks.push(new Uint8Array(final));
    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    self.postMessage({ blob });
  } catch (error) { self.postMessage({ error: error.message }); }
};
