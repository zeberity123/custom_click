import { DEFAULTS, sanitize, TapTempo } from './timing.js';
import { ClickAudio } from './audio.js';

const $ = selector => document.querySelector(selector);
const storageKey = 'click-studio-settings-v1';
let config;
try { config = sanitize(JSON.parse(localStorage.getItem(storageKey)) ?? DEFAULTS); }
catch { config = sanitize(DEFAULTS); }
let playing = false;
let started = false;
let events = [];
let activeBeat = -1;
let startRequest = 0;
let tapTimer;
let clearBeatTimer;
const tapTempo = new TapTempo();
const noteNames = { whole: 'Whole note', half: 'Half note', quarter: 'Quarter note', eighth: 'Eighth note', sixteenth: 'Sixteenth note', triplet: 'Triplet', 'triplet-skip': 'Triplet · 1 & 3', 'sixteenth-skip': '16ths · 1 & 4' };
const denominatorNames = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' };
const audio = new ClickAudio(event => {
  if (playing) {
    events.push(event);
    if (events.length > 128) events.splice(0, events.length - 128);
  }
}, state => {
  if ((state === 'suspended' || state === 'interrupted') && playing) {
    playing = false;
    audio.send('pause');
    events = [];
    renderTransport();
    showError('Audio was interrupted. Press Resume to continue.');
  }
});

function showError(message) { $('#error').textContent = message; $('#error').hidden = false; }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch { /* Ephemeral sessions can still play. */ } }
function update(patch) {
  const rhythmChanged = ['numerator', 'denominator', 'note'].some(key => Object.hasOwn(patch, key) && patch[key] !== config[key]);
  config = sanitize({ ...config, ...patch });
  if (rhythmChanged) { events = []; activeBeat = -1; $('#position').textContent = 'BAR 01 · BEAT 01'; }
  audio.configure(config);
  persist();
  render();
}
function render() {
  $('#bpm').value = config.bpm;
  $('#tempo-range').value = config.bpm;
  $('#tempo-name').textContent = config.bpm < 60 ? 'LARGO' : config.bpm < 76 ? 'ADAGIO' : config.bpm < 108 ? 'ANDANTE' : config.bpm < 120 ? 'MODERATO' : config.bpm < 168 ? 'ALLEGRO' : config.bpm < 200 ? 'PRESTO' : 'PRESTISSIMO';
  $('#decrease').disabled = config.bpm <= 10;
  $('#increase').disabled = config.bpm >= 300;
  const signature = `${config.numerator}/${config.denominator}`;
  if ($('#meter').value !== 'custom') {
    $('#meter').value = Array.from($('#meter').options).some(option => option.value === signature) ? signature : 'custom';
  }
  $('#custom-meter').hidden = $('#meter').value !== 'custom';
  $('#numerator').value = config.numerator;
  $('#denominator').value = config.denominator;
  $('#division-name').textContent = noteNames[config.note];
  document.querySelectorAll('[data-note]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.note === config.note)));
  $('#volume').value = config.volume;
  $('#volume-value').textContent = `${config.volume}%`;
  $('#pan').value = config.pan;
  $('#pan-value').textContent = config.pan === 0 ? 'Center' : `${Math.abs(config.pan)}% ${config.pan < 0 ? 'left' : 'right'}`;
  $('#beat-unit').textContent = `1 beat = ${denominatorNames[config.denominator]} note`;
  renderBeats();
}
function renderBeats() {
  const container = $('#beats');
  container.classList.toggle('many', config.numerator > 6);
  if (container.children.length !== config.numerator) {
    container.replaceChildren(...Array.from({ length: config.numerator }, (_, i) => {
      const button = document.createElement('button');
      button.className = 'beat-button';
      button.innerHTML = `<span class="beat-orb">${i + 1}</span><span class="beat-pitch"></span>`;
      button.addEventListener('click', () => {
        const accents = [...config.accents];
        accents[i] = !accents[i];
        update({ accents });
        if (!playing) preview(accents[i]);
      });
      return button;
    }));
  }
  Array.from(container.children).forEach((button, i) => {
    const pitch = config.accents[i] ? 'high' : 'low';
    button.dataset.high = String(config.accents[i]);
    button.setAttribute('aria-label', `Beat ${i + 1}: ${pitch} pitch. Click to switch.`);
    button.setAttribute('aria-pressed', String(config.accents[i]));
    button.querySelector('.beat-pitch').textContent = pitch.toUpperCase();
    button.classList.toggle('active', playing && i === activeBeat);
  });
}
function renderTransport() {
  $('#play-label').textContent = playing ? 'Pause metronome' : started ? 'Resume metronome' : 'Start metronome';
  $('#play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('#play').setAttribute('aria-label', $('#play-label').textContent);
  $('#status-text').textContent = playing ? 'Keeping you in time' : started ? 'Paused. Take a breath.' : 'Ready when you are';
  $('#status-led').classList.toggle('running', playing);
  $('#play-state').textContent = playing ? 'IN THE POCKET' : started ? 'PAUSED' : 'LET’S MAKE SOME TIME';
  renderBeats();
}
async function togglePlayback() {
  if ($('#play').disabled) return;
  if (playing) {
    playing = false;
    audio.send('pause');
    events = [];
    renderTransport();
    return;
  }
  $('#play').disabled = true;
  const request = ++startRequest;
  try {
    await audio.init();
    if (request !== startRequest) return;
    audio.configure(config);
    $('#error').hidden = true;
    playing = true;
    started = true;
    audio.send('start');
    drawWaveform(audio.samples.high);
    renderTransport();
  } catch (error) { showError(`Could not start audio: ${error.message}`); }
  finally { $('#play').disabled = false; }
}
function reset() {
  startRequest++;
  playing = false;
  started = false;
  events = [];
  activeBeat = -1;
  audio.send('reset');
  $('#position').textContent = 'BAR 01 · BEAT 01';
  renderTransport();
}
async function preview(high) {
  try {
    await audio.init();
    audio.configure(config);
    audio.send('preview', { high });
    drawWaveform(audio.samples[high ? 'high' : 'low']);
    $('#error').hidden = true;
  } catch (error) { showError(`Could not preview click: ${error.message}`); }
}
function tap() {
  const tempo = tapTempo.tap(performance.now());
  if (tempo !== null) update({ bpm: tempo });
  $('#tap-hint').textContent = tempo === null ? 'Keep tapping…' : `${tapTempo.times.length} taps · ${tempo} BPM`;
  $('#tap').classList.add('tapped');
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => $('#tap').classList.remove('tapped'), 100);
}
function commitTempo() {
  const input = $('#bpm');
  if (input.value.trim() === '') { input.value = config.bpm; return; }
  update({ bpm: input.value });
}
$('#bpm').addEventListener('change', commitTempo);
$('#bpm').addEventListener('keydown', event => { if (event.key === 'Enter') { commitTempo(); event.currentTarget.blur(); } });
$('#tempo-range').addEventListener('input', event => update({ bpm: event.target.value }));
$('#decrease').addEventListener('click', event => update({ bpm: config.bpm - (event.shiftKey ? 10 : 1) }));
$('#increase').addEventListener('click', event => update({ bpm: config.bpm + (event.shiftKey ? 10 : 1) }));
$('#tap').addEventListener('click', tap);
$('#play').addEventListener('click', togglePlayback);
$('#reset').addEventListener('click', reset);
$('#meter').addEventListener('change', event => {
  if (event.target.value === 'custom') { $('#custom-meter').hidden = false; return; }
  const [numerator, denominator] = event.target.value.split('/').map(Number);
  update({ numerator, denominator });
});
$('#numerator').addEventListener('change', event => update({ numerator: event.target.value }));
$('#denominator').addEventListener('change', event => update({ denominator: Number(event.target.value) }));
document.querySelectorAll('[data-note]').forEach(button => button.addEventListener('click', () => update({ note: button.dataset.note })));
$('#volume').addEventListener('input', event => update({ volume: Number(event.target.value) }));
$('#pan').addEventListener('input', event => update({ pan: Number(event.target.value) }));
$('#center-pan').addEventListener('click', () => update({ pan: 0 }));
$('#preview-high').addEventListener('click', () => preview(true));
$('#preview-low').addEventListener('click', () => preview(false));
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable]')) return;
  if (event.repeat) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); tap(); }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); reset(); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    update({ bpm: config.bpm + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1) });
  }
});

function animate() {
  if (playing && events.length) {
    const time = audio.audibleTime();
    let latestBeat;
    while (events.length && events[0].time <= time) {
      const event = events.shift();
      if (event.beatStart) latestBeat = event;
    }
    if (latestBeat) {
      activeBeat = latestBeat.beat;
      $('#position').textContent = `BAR ${String(latestBeat.bar).padStart(2, '0')} · BEAT ${String(latestBeat.beat + 1).padStart(2, '0')}`;
      renderBeats();
      clearTimeout(clearBeatTimer);
      clearBeatTimer = setTimeout(() => { activeBeat = -1; renderBeats(); }, Math.min(160, 60000 / config.bpm * 4 / config.denominator * .7));
    }
  }
  requestAnimationFrame(animate);
}
function drawWaveform(sample) {
  const canvas = $('#waveform');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#68884e';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(640, 40); ctx.stroke();
  ctx.strokeStyle = '#b9e38e';
  ctx.lineWidth = 2;
  for (let x = 0; x < 640; x += 4) {
    let amplitude = 0;
    if (sample) {
      const begin = Math.floor(x / 640 * sample.length);
      const end = Math.floor((x + 4) / 640 * sample.length);
      for (let i = begin; i < end; i++) amplitude = Math.max(amplitude, Math.abs(sample[i]));
    }
    ctx.beginPath(); ctx.moveTo(x, 40 - amplitude * 35); ctx.lineTo(x, 40 + amplitude * 35); ctx.stroke();
  }
}
// Draw the actual PCM waveform without opening the audio device on startup.
fetch('./assets/click-high.wav').then(response => response.arrayBuffer()).then(buffer => {
  const view = new DataView(buffer);
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const tag = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (tag === 'data') {
      const sample = new Float32Array(size / 2);
      for (let i = 0; i < sample.length; i++) sample[i] = view.getInt16(offset + 8 + i * 2, true) / 32768;
      drawWaveform(sample); return;
    }
    offset += 8 + size + size % 2;
  }
}).catch(() => drawWaveform());
render();
renderTransport();
animate();
