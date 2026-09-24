# Custom Click

A Windows desktop metronome built around the actual high and low clicks in your Cubase recordings.

To run from a fresh clone, follow the development setup below. You can then double-click **Launch Click.cmd** in this folder. After running `npm run package`, the Windows application is at **release/Click-win32-x64/Click.exe**. Keep the entire `Click-win32-x64` folder together when moving it to another PC; it runs without Node.js installed. Build outputs and dependencies are not committed to this repository.

## Controls

- Tempo: **10–300 BPM**, editable number, slider, or +/− buttons. Hold Shift when clicking +/− for steps of 10.
- Time signature: 4/4, 3/4, 2/4, 6/8, 9/8, 12/8, 5/4, 7/8, or custom (1–12 beats and a denominator of 2, 4, 8, or 16).
- Click division: whole, half, quarter, eighth, or sixteenth note. The dotted switch multiplies the duration by 1.5.
- Beat dots: one per numerator beat. Click to toggle high/low pitch; when paused, the selected sound is previewed. Subdivisions between beats use the low sample.
- Tap tempo: click **Tap tempo** or press **T** at least twice. Averages the most recent six taps; resets after 6.5 seconds without a tap.
- Volume and stereo panning: the Center label resets panning. Use headphones to hear left/right separation.
- Space: play/pause. R: reset to the beginning. Up/Down: adjust tempo; Shift for increments of 10. Shortcuts yield to input fields.
- Settings save locally between sessions. Playback never starts automatically.

BPM always means **quarter notes per minute**, including in compound meters. In 6/8, six dots mark the six eighth notes; there are three quarter-note units in the bar. Tap quarter notes to set this BPM. The selected click division is independent of the visual beat pulse. Long and dotted notes continue across bar lines without being shortened. Changing the meter or division restarts the pattern at beat one. Pause retains the musical position; reset stops and returns to beat one.

## Reference sound

The files `src/assets/click-high.wav` and `click-low.wav` are 120 ms mono samples copied directly from the first two clicks in `1_シルブプレジデント_176.wav`, supplied in the Media folder. The source is 48 kHz, 16-bit PCM with identical left/right channels. Neither waveform is synthesized, normalized, pitch-shifted, or faded. The high/low timbres are approximately 1,000/500 Hz. Their quiet tails are included in full.

The initial 176 BPM, 4/4, eighth-note pattern uses high on each quarter and low between them, matching the reference. Source frame offsets and PCM hashes are in `src/assets/provenance.json`. The engine applies a master volume and headroom gain; equal-power center panning and your output device can also change playback loudness. The timbre is taken directly from the supplied audio, but listening confirmation on your hardware remains useful.

To re-extract the samples (Python, NumPy and SciPy required only for extraction):

```powershell
python scripts/extract_clicks.py 'C:\path\to\your\Media'
```

## Development

Use Node.js 22.12+ (tested with Node 24).

```powershell
npm install
npx install-electron --no
npm start
```

```powershell
npm test            # Musical timing, PCM hashes, pause/reset, tap tempo
npm run test:desktop # Actual Electron UI, audio startup, panning, persistence
npm run package     # Windows x64 app in release/
npm run dev         # Browser preview at http://127.0.0.1:4173
```

The app is offline and has no runtime package or network dependency. Only the development and packaging tools use npm packages. Screenshots from desktop tests are written to `artifacts/`.

## Architecture and platform scope

`src/` is plain HTML/CSS/JavaScript and Web Audio. An AudioWorklet renders the sampled clicks using a fractional frame clock and 48 musical ticks per quarter note, independently of UI timers. Visual events use the audio output timestamp to follow playback. Pause fades the current sound over 5 ms. Gain/pan changes are smoothed. The Electron window keeps background throttling off and prevents idle app suspension while open; explicit system sleep still interrupts playback.

`desktop/main.cjs` supplies an isolated, sandboxed Electron window and a local asset protocol. There is no renderer access to Node.js and no third-party remote content. The window can be resized to phone width.

This delivery targets **Windows x64 desktop**. The responsive interface and Web Audio code can be reused for Android/iOS, but mobile packaging, audio interruption handling, background/lock-screen playback, and device latency testing are future work. Other desktop operating systems also need their own builds and validation.

Implementation references: [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
