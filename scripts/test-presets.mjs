import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

// Real Electron + AudioWorklet: preset editing, persistence, and timed tempo changes during playback.
await mkdir('artifacts', { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', '--user-data-dir=' + path.resolve('artifacts/presets-profile')], env });
try {
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForSelector('#presets .preset-button');
  const presets = () => page.locator('.preset-button:not(.empty) strong').allTextContents();
  const bpm = async () => Number(await page.locator('#bpm').inputValue());

  // No factory presets: the grid starts with 8 empty slots.
  assert.deepEqual(await presets(), []);
  assert.equal(await page.locator('.preset-button').count(), 8);
  assert.equal(await page.locator('#preset-remove').isDisabled(), true);
  assert.equal(await page.locator('#bpm').getAttribute('max'), '250');
  assert.equal(await page.locator('#tempo-range').getAttribute('max'), '250');
  assert.equal((await page.locator('#tempo-caption').innerText()).trim(), '');   // 'BEATS PER MINUTE' is gone
  for (const value of [200, 150, 175, 192]) {
    await page.locator('#bpm').fill(String(value)); await page.locator('#bpm').press('Enter');
    await page.locator('#preset-add').click();
  }
  assert.deepEqual(await presets(), ['200', '150', '175', '192']);

  // Stopped: a preset sets the tempo immediately and becomes the selection.
  await page.locator('.preset-button').nth(1).click();
  assert.equal(await bpm(), 150);
  assert.equal(await page.locator('.preset-button').nth(1).getAttribute('aria-pressed'), 'true');
  await page.locator('#preset-remove').click();
  assert.deepEqual(await presets(), ['200', '175', '192']);
  assert.equal(await page.locator('#preset-remove').isDisabled(), true);
  await page.locator('#bpm').fill('133'); await page.locator('#bpm').press('Enter');
  await page.locator('#preset-add').click();
  assert.deepEqual(await presets(), ['200', '175', '192', '133']);
  assert.equal(await page.locator('.preset-button').nth(3).getAttribute('aria-pressed'), 'true');
  await page.locator('#preset-add').click();   // duplicate: selects, does not add
  assert.equal((await presets()).length, 4);
  for (const value of [90, 100, 110, 120]) {
    await page.locator('#bpm').fill(String(value)); await page.locator('#bpm').press('Enter');
    await page.locator('#preset-add').click();
  }
  assert.equal((await presets()).length, 8);
  assert.equal(await page.locator('#preset-add').isDisabled(), true);
  await page.reload();
  assert.deepEqual(await presets(), ['200', '175', '192', '133', '90', '100', '110', '120']);
  // Delete 110 and 100 so 120 is preset 6 for the playback tests.
  for (const index of [6, 5]) { await page.locator('.preset-button').nth(index).click(); await page.locator('#preset-remove').click(); }
  assert.deepEqual(await presets(), ['200', '175', '192', '133', '90', '120']);

  // Playing: "change after this bar" waits for the next downbeat.
  await page.locator('.preset-button').nth(5).click();          // 120 BPM, stopped
  await page.getByRole('button', { name: 'Quarter note', exact: true }).click();
  await page.locator('#play').click();
  await page.getByRole('button', { name: 'Stop' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#position').textContent.includes('BEAT 02'));
  await page.locator('#preset-at-bar').check();
  const bar = Number((await page.locator('#position').textContent()).match(/BAR (\d+)/)[1]);
  const tempoHeight = async () => (await page.locator('.tempo-control').boundingBox()).height;
  const heightBefore = await tempoHeight();
  await page.locator('.preset-button').nth(0).click();          // 200
  assert.equal(await bpm(), 120);
  assert.equal(await page.locator('#tempo-target').textContent(), '→ 200 BPM');
  // The target replaces the caption line instead of adding one, so the layout never grows.
  assert.equal(await page.locator('#tempo-caption #tempo-target').isVisible(), true);
  assert.equal(await tempoHeight(), heightBefore);
  assert.equal(await page.locator('.preset-button').nth(0).getAttribute('aria-pressed'), 'true');
  const switched = await page.waitForFunction(() => document.querySelector('#bpm').value === '200' && document.querySelector('#position').textContent, null, { timeout: 4000 });
  const position = await switched.jsonValue();
  assert.ok(position.includes(`BAR ${String(bar + 1).padStart(2, '0')}`) && position.includes('BEAT 01'), `switched at ${position}`);
  assert.equal(await page.locator('#tempo-target').isHidden(), true);

  // Gradual change: passes through intermediate tempos and lands on the target.
  await page.locator('#preset-at-bar').uncheck();
  await page.locator('#preset-gradual').check();
  await page.locator('#preset-bars').fill('2'); await page.locator('#preset-bars').press('Tab');
  await page.locator('.preset-button').nth(5).click();          // 120 over 2 bars
  const seen = new Set();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { const value = await bpm(); seen.add(value); if (value === 120) break; await page.waitForTimeout(40); }
  assert.ok([...seen].some(value => value > 120 && value < 200), `no intermediate tempo: ${[...seen]}`);
  assert.equal(await bpm(), 120);

  // Keyboard 1–8 picks presets; immediate mode while playing.
  await page.locator('#preset-gradual').uncheck();
  await page.locator('.metronome .section-label').first().click();
  await page.keyboard.press('3');
  await page.waitForFunction(() => document.querySelector('#bpm').value === '192', null, { timeout: 1500 });

  // Stop always returns to bar 1; the next Start begins from the top at the set tempo.
  await page.locator('#play').click();
  assert.equal(await page.locator('#play-label').textContent(), 'Start');
  assert.ok((await page.locator('#position').textContent()).includes('BAR 01 · BEAT 01'));
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#position').textContent.includes('BEAT 02'));
  assert.ok((await page.locator('#position').textContent()).includes('BAR 01'));
  await page.locator('#play').click();

  await page.locator('#language').selectOption('ko');
  assert.equal(await page.locator('.preset-section .section-label').textContent(), 'BPM 프리셋');
  assert.equal(await page.locator('#preset-at-bar + span').textContent(), '마디 끝난 후 변경');
  await page.locator('#language').selectOption('en');
  assert.deepEqual(errors, []);
  console.log('PASS: BPM presets (add/delete/limit/persist), change after bar, gradual change, keyboard presets, Stop rewinds to bar 1, 250 BPM limit.');
} finally { await app.close(); }
