import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launchPortable } from './launch-portable.mjs';

await mkdir('artifacts', { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const profile = '--user-data-dir=' + path.resolve(`artifacts/${packaged ? 'packaged' : 'test'}-profile`);
const app = process.argv.includes('--portable') ? await launchPortable(env) : await electron.launch({
  ...(packaged ? { executablePath: path.resolve('release/Click-win32-x64/Click.exe') } : {}),
  args: packaged ? [profile] : ['.', profile], env,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#beats .beat-button');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  assert.equal(await page.locator('.beat-button').count(), 4);
  assert.equal(await page.locator('#meter').count(), 0);
  assert.equal(await page.locator('#custom-meter').isVisible(), true);
  assert.equal(await page.locator('.beat-button.active').count(), 1);
  await page.screenshot({ path: 'artifacts/desktop.png' });
  await page.locator('#play').click();
  await page.getByRole('button', { name: 'Pause metronome' }).waitFor();
  const beatContinuity = await page.evaluate(() => new Promise(resolve => {
    const deadline = performance.now() + 900, beats = new Set();
    let gaps = 0;
    function sample() {
      const active = document.querySelectorAll('.beat-button.active');
      if (active.length !== 1) gaps++;
      if (active[0]) beats.add(active[0].textContent);
      if (performance.now() < deadline) requestAnimationFrame(sample);
      else resolve({ gaps, beats: beats.size });
    }
    sample();
  }));
  assert.equal(beatContinuity.gaps, 0);
  assert.ok(beatContinuity.beats > 1);
  await page.waitForFunction(() => document.querySelector('#position').textContent.includes('BAR 02'));
  assert.equal(await page.locator('#error').isHidden(), true);
  await page.locator('#play').click();
  assert.equal(await page.locator('#play-label').textContent(), 'Resume metronome');
  assert.equal(await page.locator('.beat-button.active').count(), 1);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#play-label').textContent(), 'Start metronome');
  assert.equal(await page.locator('.beat-button.active .beat-orb').textContent(), '1');
  assert.equal(await page.locator('#dotted').count(), 0);
  for (const note of ['triplet', 'triplet-skip', 'sixteenth-skip']) {
    await page.locator(`[data-note="${note}"]`).click();
    assert.equal(await page.locator('[data-note][aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator(`[data-note="${note}"]`).getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator(`[data-note="${note}"]`).getAttribute('aria-pressed'), 'true');
    await page.locator('#play').click();
    await page.getByRole('button', { name: 'Pause metronome' }).waitFor();
    await page.waitForFunction(() => document.querySelector('#position').textContent.includes('BAR 02'));
    assert.equal(await page.locator('#error').isHidden(), true);
    await page.locator('#reset').click();
  }
  await page.locator('.beat-button').nth(1).click();
  assert.equal(await page.locator('.beat-button').nth(1).getAttribute('data-high'), 'false');
  await page.locator('#numerator').fill('6');
  await page.locator('#numerator').press('Tab');
  await page.locator('#denominator').selectOption('8');
  assert.equal(await page.locator('.beat-button').count(), 6);
  await page.locator('#numerator').fill('11');
  await page.locator('#numerator').press('Tab');
  await page.locator('#denominator').selectOption('16');
  assert.equal(await page.locator('.beat-button').count(), 11);
  await page.getByRole('button', { name: 'Sixteenth note', exact: true }).click();
  await page.getByRole('button', { name: 'Triplet: first and third only', exact: true }).click();
  await page.locator('#bpm').fill('500');
  await page.locator('#bpm').press('Enter');
  assert.equal(await page.locator('#bpm').inputValue(), '300');
  await page.locator('#bpm').fill('1');
  await page.locator('#bpm').press('Enter');
  assert.equal(await page.locator('#bpm').inputValue(), '10');
  await page.locator('#pan').evaluate(element => { element.value = '-100'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.locator('#pan-value').textContent(), '100% left');
  await page.locator('#center-pan').click();
  assert.equal(await page.locator('#pan-value').textContent(), 'Center');
  await page.reload();
  assert.equal(await page.locator('#bpm').inputValue(), '10');
  assert.equal(await page.locator('.beat-button').count(), 11);
  assert.equal(await page.locator('[data-note="triplet-skip"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#numerator').fill('4');
  await page.locator('#numerator').press('Tab');
  await page.locator('#denominator').selectOption('4');
  await page.getByRole('button', { name: 'Eighth note', exact: true }).click();
  assert.equal(await page.locator('.pattern-options [aria-pressed="true"]').count(), 0);
  await page.locator('#bpm').fill('176');
  await page.locator('#bpm').press('Enter');
  await page.locator('.metronome .section-label').first().click();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Pause metronome' }).waitFor();
  await page.keyboard.press('Space');
  await page.keyboard.press('r');
  await page.locator('#tap').click();
  await page.waitForTimeout(500);
  await page.locator('#tap').click();
  const tapped = Number(await page.locator('#bpm').inputValue());
  assert.ok(tapped > 90 && tapped < 130, `Tap tempo produced ${tapped}`);
  const rendering = await page.evaluate(async () => {
    const result = {};
    for (const pan of [-1, 0, 1]) {
      const context = new OfflineAudioContext(2, 4800, 48000);
      const sample = await context.decodeAudioData(await (await fetch('./assets/click-high.wav')).arrayBuffer());
      const source = context.createBufferSource();
      source.buffer = sample;
      const panner = new StereoPannerNode(context, { pan });
      source.connect(panner).connect(context.destination);
      source.start();
      const rendered = await context.startRendering();
      result[pan] = [0, 1].map(channel => rendered.getChannelData(channel).reduce((sum, value) => sum + value * value, 0));
    }
    return result;
  });
  assert.ok(rendering[-1][0] > 1 && rendering[-1][1] < 1e-8);
  assert.ok(rendering[1][1] > 1 && rendering[1][0] < 1e-8);
  assert.ok(Math.abs(rendering[0][0] - rendering[0][1]) < 1e-5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/narrow.png', fullPage: true });
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth).map(element => [element.tagName, element.className, element.getBoundingClientRect().right]) }));
  assert.ok(overflow.scroll <= overflow.width, JSON.stringify(overflow));
  // Browser safe areas reserve space for both transport and the drawer.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '28px');
    document.documentElement.style.setProperty('--safe-bottom', '48px');
  });
  const brandBox = await page.locator('.brand').boundingBox();
  const playBox = await page.locator('#play').boundingBox();
  assert.ok(brandBox.y >= 28 && playBox.y + playBox.height <= 844 - 48);
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#settings-drawer').getAttribute('aria-modal'), 'true');
  await page.locator('#volume').fill('70');
  assert.equal(await page.locator('#volume-value').textContent(), '70%');
  await page.setViewportSize({width:1100,height:880});
  await page.waitForFunction(() => !document.documentElement.classList.contains('mobile'));
  assert.equal(await page.locator('#settings-drawer').evaluate(element => element.inert), false);
  assert.equal(await page.locator('.metronome').evaluate(element => element.inert), false);
  assert.equal(await page.locator('#settings-drawer').getAttribute('aria-modal'), null);
  assert.deepEqual(errors, []);
  await page.evaluate(() => localStorage.clear());
  console.log('PASS: desktop audio playback, all three rhythmic patterns, custom meter, tempo bounds, persistence, shortcuts, tap tempo, stereo rendering, narrow layout, and no renderer errors.');
} finally { await app.close(); }
