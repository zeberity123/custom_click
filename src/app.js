import { DEFAULTS, sanitize, TapTempo } from './timing.js';
import { ClickAudio } from './audio.js';
import { NativeAudio } from './native-audio.js';
import { t, initLanguage } from './i18n.js';
import { setupExport } from './export-ui.js';
import { setupUpdates } from './update-ui.js';
import { setupAndroidBack } from './android-back.js';
import { IOSAudio } from './ios-audio.js';

const isAndroid = typeof window.NativeClick !== 'undefined';
const isIOS = typeof window.IOSClick !== 'undefined';
const isNative = isAndroid || isIOS;
if (isAndroid) document.documentElement.classList.add('android');
if (isIOS) {
  document.documentElement.classList.add('ios');
  // Apple fonts do not consistently include the whole/half-note music code points.
  for (const note of ['whole','half']) {
    const symbol = document.querySelector(`[data-note="${note}"] > span`);
    symbol.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="10" cy="${note === 'whole' ? 13 : 18}" rx="5" ry="3" transform="rotate(-20 10 ${note === 'whole' ? 13 : 18})" fill="none" stroke="currentColor" stroke-width="1.8"/>${note === 'half' ? '<path d="M15 17V3" fill="none" stroke="currentColor" stroke-width="1.8"/>' : ''}</svg>`;
  }
}

const $ = selector => document.querySelector(selector);
const mobileQuery = matchMedia('(max-width: 650px)');
const drawer = $('#settings-drawer');
const drawerBackground = [...document.querySelectorAll('.app-header, .metronome, #error')];
let drawerOpen = false;
let drawerTrigger;
function setDrawer(open, restoreFocus = true) {
  if (open && !drawerOpen) drawerTrigger = document.activeElement;
  drawerOpen = open && document.documentElement.classList.contains('mobile');
  document.documentElement.classList.toggle('drawer-open', drawerOpen);
  $('#open-settings').setAttribute('aria-expanded', String(drawerOpen));
  $('#drawer-handle').setAttribute('aria-expanded', String(drawerOpen));
  $('#drawer-backdrop').hidden = !drawerOpen;
  drawer.inert = !drawerOpen && document.documentElement.classList.contains('mobile');
  drawerBackground.forEach(element => { element.inert = drawerOpen; });
  if (drawerOpen) {
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    $('#close-settings').focus({ preventScroll: true });
  } else {
    drawer.removeAttribute('role');
    drawer.removeAttribute('aria-modal');
    if (restoreFocus) (drawerTrigger?.matches('#open-settings, #drawer-handle') ? drawerTrigger : $('#open-settings')).focus({ preventScroll: true });
  }
}
function syncMobileLayout() {
  document.documentElement.classList.toggle('mobile', isAndroid || mobileQuery.matches);
  setDrawer(false, false);
}
mobileQuery.addEventListener('change', syncMobileLayout);
syncMobileLayout();
$('#open-settings').addEventListener('click', () => setDrawer(true));
$('#drawer-handle').addEventListener('click', () => setDrawer(true));
$('#close-settings').addEventListener('click', () => setDrawer(false));
$('#drawer-backdrop').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', event => {
  if (!drawerOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
  if (event.key === 'Tab') {
    const controls = [...drawer.querySelectorAll('button, input, select')].filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
// Horizontal swipes browse the right-hand drawer; sliders keep their own gestures.
let swipe;
document.addEventListener('pointerdown', event => {
  swipe = null;
  if (!document.documentElement.classList.contains('mobile') || !event.isPrimary || (event.pointerType === 'mouse' && !event.target.closest('#drawer-handle')) || (event.target.closest('button, input, select, a') && !event.target.closest('#drawer-handle'))) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, open: drawerOpen };
});
document.addEventListener('pointercancel', () => { swipe = null; });
document.addEventListener('pointerup', event => {
  if (!swipe || swipe.id !== event.pointerId) return;
  const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    // Accept rightward opening swipes as well as the existing leftward edge gesture.
    if (!swipe.open) setDrawer(true);
    else if (swipe.open && dx > 0) setDrawer(false);
  }
  swipe = null;
});
const storageKey = 'click-studio-settings-v1';
let config;
try { config = sanitize(JSON.parse(localStorage.getItem(storageKey)) ?? DEFAULTS); }
catch { config = sanitize(DEFAULTS); }
// A new session starts with automation off; an active Android service restores its state below.
config.automation.enabled = false;
let playing = false;
let started = false;
let events = [];
let activeBeat = 0;
let currentBpm = config.bpm;
let position = { bar: 1, beat: 0 };
let startRequest = 0;
let tapTimer;
let editingTempo = false;
const tapTempo = new TapTempo();
const noteNames = { whole: 'Whole note', half: 'Half note', quarter: 'Quarter note', eighth: 'Eighth note', sixteenth: 'Sixteenth note', triplet: 'Triplet', 'triplet-skip': 'Triplet · 1 & 3', 'sixteenth-skip': '16ths · 1 & 4' };
const AudioEngine = isAndroid ? NativeAudio : isIOS ? IOSAudio : ClickAudio;
const audio = new AudioEngine(event => {
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
    showError(t('Audio was interrupted. Press Resume to continue.'));
  }
});

function syncNativeState(state) {
  if (state.config?.bpm) { config = sanitize(state.config); persist(); render(); }
  currentBpm = state.currentBpm ?? config.bpm;
  renderAutomation();
  playing = state.playing === true;
  if (playing) started = true;
  else { events = []; }
  renderTransport();
  if (state.error || state.message) showError(state.error || state.message);
}
if (isNative) {
  window.addEventListener('native-state', event => syncNativeState(event.detail));
}

function showError(message) { $('#error').textContent = t(message); $('#error').hidden = false; }
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(config)); } catch { /* Ephemeral sessions can still play. */ }
  if (isIOS) void window.IOSClick.call('saveSettings', { settings: config }).catch(() => {});
}
function update(patch) {
  const rhythmChanged = ['numerator', 'denominator', 'note', 'automation'].some(key => Object.hasOwn(patch, key) && patch[key] !== config[key]);
  config = sanitize({ ...config, ...patch });
  if (rhythmChanged || (Object.hasOwn(patch, 'bpm') && config.automation.enabled)) { events = []; activeBeat = 0; position = {bar:1,beat:0}; renderPosition(); }
  if (rhythmChanged || Object.hasOwn(patch, 'bpm')) currentBpm = config.bpm;
  audio.configure(config);
  persist();
  render();
}
function render() {
  $('#numerator').value = config.numerator;
  $('#denominator').value = config.denominator;
  $('#division-name').textContent = t(noteNames[config.note]);
  document.querySelectorAll('[data-note]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.note === config.note)));
  $('#volume').value = config.volume;
  $('#volume-value').textContent = `${config.volume}%`;
  $('#pan').value = config.pan;
  $('#pan-value').textContent = config.pan === 0 ? t('Center') : t(config.pan < 0 ? '{pan}% left' : '{pan}% right', {pan:Math.abs(config.pan)});
  $('#beat-unit').textContent = t('1 beat = {note}', {note:t(({2:'Half note',4:'Quarter note',8:'Eighth note',16:'Sixteenth note'})[config.denominator])});
  renderSettingsSummary();
  renderAutomation();
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
    button.setAttribute('aria-label', t('Beat {beat}: {pitch} pitch. Click to switch.',{beat:i+1,pitch:t(config.accents[i] ? 'High' : 'Low')}));
    button.setAttribute('aria-pressed', String(config.accents[i]));
    button.querySelector('.beat-pitch').textContent = t(pitch.toUpperCase());
    button.classList.toggle('active', i === Math.min(activeBeat, config.numerator - 1));
  });
}
function renderTransport() {
  $('#play-label').textContent = t(playing ? 'Pause' : started ? 'Resume' : 'Start');
  $('#play-icon').textContent = playing ? 'Ⅱ' : isIOS ? '▶︎' : '▶';
  $('#play').setAttribute('aria-label', $('#play-label').textContent);
  $('#play-state').textContent = playing ? t('IN THE POCKET') : started ? t('PAUSED') : '';
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
    renderTransport();
  } catch (error) { showError(t('Could not start audio: {error}',{error:error.message})); }
  finally { $('#play').disabled = false; }
}
function reset() {
  startRequest++;
  playing = false;
  started = false;
  events = [];
  activeBeat = 0;
  audio.send('reset');
  position = {bar:1,beat:0}; currentBpm = config.bpm; renderPosition(); renderAutomation();
  renderTransport();
}
async function preview(high) {
  try {
    await audio.init();
    audio.configure(config);
    audio.send('preview', { high });
    $('#error').hidden = true;
  } catch (error) { showError(t('Could not preview click: {error}',{error:error.message})); }
}
function tap() {
  const tempo = tapTempo.tap(performance.now());
  if (tempo !== null) update({ bpm: tempo });
  $('#tap-hint').textContent = tempo === null ? t('Keep tapping…') : t('{count} taps · {bpm} BPM',{count:tapTempo.times.length,bpm:tempo});
  $('#tap').classList.add('tapped');
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => $('#tap').classList.remove('tapped'), 100);
}
function commitTempo() {
  const input = $('#bpm');
  if (!editingTempo) return;
  editingTempo = false;
  if (input.value.trim() === '') { renderCurrentTempo(); return; }
  update({ bpm: input.value });
}
function renderSettingsSummary() {
  const meter = `${config.numerator}/${config.denominator}`;
  const volume = String(Math.round(config.volume)).padStart(2, '0');
  $('#settings-meter').textContent = meter;
  $('#settings-volume').textContent = `${volume}%`;
  const selected = document.querySelector(`[data-note="${config.note}"]`);
  const symbol = selected.querySelector('span').cloneNode(true);
  const fraction = document.createElement('small');
  fraction.textContent = ({triplet:'3', 'triplet-skip':'3', 'sixteenth-skip':'1/16'})[config.note] ?? selected.querySelector('small').textContent;
  $('#settings-division').replaceChildren(symbol, fraction);
  $('#open-settings').setAttribute('aria-label', t('Time signature {meter}, {division}, volume {volume}%. Open settings.', {meter,division:t(noteNames[config.note]),volume}));
}
$('#bpm').addEventListener('input', () => { editingTempo = true; });
$('#bpm').addEventListener('change', commitTempo);
$('#bpm').addEventListener('blur', () => { commitTempo(); renderCurrentTempo(); });
$('#bpm').addEventListener('keydown', event => { if (event.key === 'Enter') { commitTempo(); event.currentTarget.blur(); } });
$('#tempo-range').addEventListener('input', event => update({ bpm: event.target.value }));
$('#decrease').addEventListener('click', event => update({ bpm: displayedTempo() - (event.shiftKey ? 10 : 1) }));
$('#increase').addEventListener('click', event => update({ bpm: displayedTempo() + (event.shiftKey ? 10 : 1) }));
$('#tap').addEventListener('click', tap);
$('#play').addEventListener('click', togglePlayback);
$('#reset').addEventListener('click', reset);
$('#numerator').addEventListener('change', event => update({ numerator: event.target.value }));
$('#denominator').addEventListener('change', event => update({ denominator: Number(event.target.value) }));
document.querySelectorAll('[data-note]').forEach(button => button.addEventListener('click', () => update({ note: button.dataset.note })));
$('#volume').addEventListener('input', event => update({ volume: Number(event.target.value) }));
$('#pan').addEventListener('input', event => update({ pan: Number(event.target.value) }));
$('#center-pan').addEventListener('click', () => update({ pan: 0 }));
document.addEventListener('keydown', event => {
  if (drawerOpen || $('#export-dialog').open || $('#update-dialog').open) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable]')) return;
  if (event.repeat) return;
  if (event.code === 'Space' && event.target.closest('#automation-enabled')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); tap(); }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); reset(); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    update({ bpm: displayedTempo() + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1) });
  }
});

function animate() {
  if (playing && events.length) {
    const time = audio.audibleTime();
    let latestBeat;
    while (events.length && events[0].time <= time) {
      const event = events.shift();
      if (event.bpm != null && currentBpm !== event.bpm) { currentBpm = event.bpm; renderCurrentTempo(); }
      if (event.beatStart) latestBeat = event;
    }
    if (latestBeat) {
      activeBeat = latestBeat.beat;
      position = latestBeat; renderPosition();
      renderBeats();
    }
  }
  requestAnimationFrame(animate);
}
function renderPosition() {
  $('#position').textContent = t('BAR {bar} · BEAT {beat}', {bar:String(position.bar).padStart(2,'0'),beat:String(position.beat+1).padStart(2,'0')});
}
function renderAutomation() {
  const a = config.automation;
  $('#automation-enabled').setAttribute('aria-pressed', String(a.enabled));
  $('#automation-enabled').textContent = t(a.enabled ? 'Automation: ON' : 'Automation: OFF');
  $('#automation-direction').value = a.delta < 0 ? '-1' : '1';
  $('#automation-delta').value = Math.abs(a.delta) || 1;
  $('#automation-every').value = a.every;
  $('#automation-unit').value = a.unit;
  document.querySelectorAll('.automation-fields input, .automation-fields select').forEach(element => element.disabled = !a.enabled);
  renderCurrentTempo();
}
function displayedTempo() { return config.automation.enabled ? currentBpm : config.bpm; }
function renderCurrentTempo() {
  const bpm = displayedTempo();
  if (!editingTempo) $('#bpm').value = bpm;
  $('#tempo-range').value = bpm;
  $('#tempo-name').textContent = bpm < 60 ? 'LARGO' : bpm < 76 ? 'ADAGIO' : bpm < 108 ? 'ANDANTE' : bpm < 120 ? 'MODERATO' : bpm < 168 ? 'ALLEGRO' : bpm < 200 ? 'PRESTO' : 'PRESTISSIMO';
  $('#decrease').disabled = bpm <= 10;
  $('#increase').disabled = bpm >= 300;
  const enabled = config.automation.enabled, status = t('Start tempo: {bpm} BPM', {bpm:config.bpm});
  $('#automation-status').textContent = enabled ? status : t('Automation off');
  $('#tempo-caption').textContent = t('BEATS PER MINUTE');
  $('#live-tempo').hidden = !enabled;
  $('#live-tempo').textContent = status;
}
function changeAutomation() {
  update({automation:{enabled:config.automation.enabled,delta:Number($('#automation-direction').value)*Math.max(1,Number($('#automation-delta').value)),every:Number($('#automation-every').value),unit:$('#automation-unit').value}});
}
$('#automation-enabled').addEventListener('click', () => update({ automation: { ...config.automation, enabled: !config.automation.enabled } }));
for (const id of ['automation-direction','automation-delta','automation-every','automation-unit']) $('#'+id).addEventListener('change',changeAutomation);
const refreshExport = setupExport(() => config);
const refreshUpdates = setupUpdates(async () => { if (playing) await togglePlayback(); });
setupAndroidBack(() => drawerOpen, () => setDrawer(false));
initLanguage(() => { render(); renderTransport(); renderPosition(); $('#tap-hint').textContent = t('Tap at least twice'); refreshExport(); refreshUpdates(); });
animate();
// The HTML can appear before modules and the native engine finish loading.
// Keep Start unavailable until its handlers and initial native state are ready.
if (isNative) audio.init().then(() => syncNativeState(audio.snapshot())).catch(error => showError(error.message)).finally(() => { $('#play').disabled = false; });
else $('#play').disabled = false;
