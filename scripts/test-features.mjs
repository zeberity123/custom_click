import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('artifacts',{recursive:true});
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const packaged=process.argv.includes('--packaged');
const profile='--user-data-dir='+path.resolve(`artifacts/features-${packaged?'packaged':'source'}-profile`);
const app=await electron.launch({...(packaged?{executablePath:path.resolve('release/portable/win-unpacked/Click.exe')} : {}),args:packaged?[profile]:['.',profile],env});
try {
  const page=await app.firstWindow(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>localStorage.clear()); await page.reload();
  await page.waitForSelector('#beats .beat-button');
  assert.equal(await page.locator('.header-caption,.footer-dot,#platform-label').count(),0);
  assert.equal(await page.locator('#automation-enabled').textContent(),'Automation: OFF');
  assert.equal(await page.locator('#automation-delta').isDisabled(),true);
  for (const [language,start,save] of [['ko','메트로놈 시작','MP3 저장'],['ja','メトロノーム開始','MP3 を保存'],['en','Start metronome','Save MP3']]) {
    await page.locator('#language').selectOption(language);
    assert.equal(await page.locator('html').getAttribute('lang'),language);
    assert.equal(await page.locator('#play-label').textContent(),start);
    await page.locator('#open-export').click();
    assert.equal(await page.locator('#save-export').textContent(),save);
    await page.keyboard.press('Escape');
    await page.reload();
    assert.equal(await page.locator('#language').inputValue(),language);
  }
  await page.locator('#bpm').fill('120'); await page.locator('#bpm').press('Enter');
  await page.locator('#automation-enabled').click();
  assert.equal(await page.locator('#automation-enabled').textContent(),'Automation: ON');
  assert.equal(await page.locator('#automation-enabled').getAttribute('aria-pressed'),'true');
  await page.locator('#automation-enabled').press('Space');
  assert.equal(await page.locator('#automation-enabled').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#play-label').textContent(),'Start metronome');
  await page.locator('#automation-enabled').press('Enter');
  assert.equal(await page.locator('#automation-enabled').getAttribute('aria-pressed'),'true');
  await page.locator('#automation-delta').fill('60'); await page.locator('#automation-delta').press('Tab');
  await page.locator('#automation-every').fill('1'); await page.locator('#automation-every').press('Tab');
  await page.locator('#automation-unit').selectOption('seconds');
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#bpm').value==='180');
  assert.equal(await page.locator('#tempo-range').inputValue(),'180');
  assert.equal(await page.locator('#live-tempo').textContent(),'Start tempo: 120 BPM');
  assert.equal(await page.locator('#automation-status').textContent(),'Start tempo: 120 BPM');
  // Live automation must not overwrite a number while the user is typing it.
  await page.locator('#bpm').fill('125');
  await page.waitForFunction(()=>document.querySelector('#tempo-range').value==='240');
  assert.equal(await page.locator('#bpm').inputValue(),'125');
  await page.locator('#bpm').press('Enter');
  assert.equal(await page.locator('#live-tempo').textContent(),'Start tempo: 125 BPM');
  await page.locator('#bpm').fill('120'); await page.locator('#bpm').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#bpm').value==='180');
  await page.locator('#play').click();
  const paused=await page.locator('#bpm').inputValue();
  await page.waitForTimeout(1100); assert.equal(await page.locator('#bpm').inputValue(),paused);
  await page.locator('#language').selectOption('ko');
  assert.equal(await page.locator('#play-label').textContent(),'메트로놈 재생');
  assert.equal(await page.locator('#live-tempo').textContent(),'시작 템포: 120 BPM');
  await page.locator('#language').selectOption('en');
  await page.locator('#increase').click();
  assert.equal(await page.locator('#bpm').inputValue(),String(Number(paused)+1));
  await page.locator('#bpm').fill('120'); await page.locator('#bpm').press('Enter');
  await page.locator('#reset').click();
  assert.equal(await page.locator('#bpm').inputValue(),'120');
  assert.ok((await page.locator('#automation-status').textContent()).includes('120 BPM'));
  await page.locator('#automation-unit').selectOption('bars');
  await page.getByRole('button',{name:'Quarter note',exact:true}).click();
  await page.locator('#pan').fill('-100');
  await page.locator('#volume').fill('100');
  await page.reload();
  assert.equal(await page.locator('#automation-enabled').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#automation-enabled').textContent(),'Automation: OFF');
  assert.equal(await page.locator('#automation-delta').inputValue(),'60');
  await page.locator('#automation-enabled').click();
  await page.screenshot({path:'artifacts/features-desktop.png',fullPage:true});
  await page.locator('#open-export').click();
  await page.locator('#export-length').fill('2');
  await app.evaluate(({dialog},filePath)=>{ dialog.showSaveDialog=async()=>({canceled:false,filePath}); },path.resolve('artifacts/automation-export.mp3'));
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='MP3 saved.');
  const mp3=await readFile('artifacts/automation-export.mp3');
  assert.ok(mp3.length>50000);
  const decoded=await page.evaluate(async bytes=>{
    const context=new AudioContext();
    try {
      const buffer=await context.decodeAudioData(new Uint8Array(bytes).buffer);
      return {duration:buffer.duration,channels:buffer.numberOfChannels,energies:[0,1].map(channel=>buffer.getChannelData(channel).reduce((sum,x)=>sum+x*x,0))};
    } finally {await context.close();}
  },Array.from(mp3));
  assert.equal(decoded.channels,2); assert.ok(Math.abs(decoded.duration-(2+4/3))<.1,JSON.stringify(decoded));
  assert.ok(decoded.energies[0]>1 && decoded.energies[1]<.001,JSON.stringify(decoded));
  await page.locator('#export-unit').selectOption('seconds');
  await page.locator('#export-length').fill('3601');
  await page.locator('#save-export').click();
  assert.ok((await page.locator('#export-status').textContent()).includes('60 minutes'));
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
  await page.locator('#export-length').fill('1');
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='Export cancelled.');
  await page.locator('#export-length').fill('3600');
  await page.locator('#save-export').click();
  await page.locator('#cancel-export').click();
  assert.equal(await page.locator('#export-dialog').evaluate(element=>element.open),false);
  await page.locator('#open-export').click();
  assert.equal(await page.locator('#save-export').isEnabled(),true);
  await page.locator('#close-export').click();
  for (const lang of ['ko','ja','en']) {
    await page.locator('#language').selectOption(lang);
    for (const viewport of [{width:320,height:568},{width:390,height:760}]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(()=>document.documentElement.classList.contains('mobile'));
      for (const selector of ['#play','#reset','#language','#open-export']) {
        const box=await page.locator(selector).boundingBox();
        assert.ok(box && box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width && box.y+box.height<=viewport.height,`${lang} ${selector}: ${JSON.stringify(box)}`);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.setViewportSize({width:390,height:760});
    await page.locator('#open-settings').click();
    await page.locator('#automation-unit').scrollIntoViewIfNeeded();
    await page.screenshot({path:`artifacts/features-${lang}-mobile.png`});
    await page.locator('#close-settings').click();
    await page.locator('#settings-drawer').waitFor({state:'hidden'});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: all three languages and persistence, automation progression/pause/reset, offline MP3 export decoded with automated duration and stereo pan, and mobile controls.');
} finally {await app.close();}
