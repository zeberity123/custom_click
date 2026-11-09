import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.','--user-data-dir='+path.resolve('artifacts/ios-ui-profile')],env});
try {
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    let state={config:{},playing:false},bytes=0;
    window.iosCalls=[];
    window.IOSClick={call:async(command,payload={})=>{
      window.iosCalls.push({command,payload});
      if(command==='ready')return state;
      if(command==='configure'){state.config=payload.config;return true;}
      if(command==='tempo'){state.config={...state.config,bpm:payload.bpm};return true;}
      if(command==='command'){
        if(payload.type!=='preview')state.playing=payload.type==='start';
        window.dispatchEvent(new CustomEvent('native-state',{detail:structuredClone(state)}));return state;
      }
      if(command==='beginExport'){bytes=0;return true;}
      if(command==='appendExport'){bytes+=atob(payload.data).length;return true;}
      if(command==='finishExport'){
        window.exportBytes=bytes;
        if(window.failExport)throw new Error('Disk full');
        return {saved:true,filename:payload.filename,device:'iPad'};
      }
      return true;
    }};
  });
  // There are no factory presets; seed two for the playback checks below.
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('click-presets-v1',JSON.stringify({list:[200,150]}));});await page.reload();
  for(const size of [{width:834,height:1150},{width:1194,height:786},{width:390,height:760},{width:320,height:568}]) {
    await page.setViewportSize(size);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const id of ['#bpm','#play','#tap','#presets'])assert.equal(await page.locator(id).isVisible(),true);
    const playBox=await page.locator('#play').boundingBox();
    assert.ok(playBox.y+playBox.height<=size.height,`Play below viewport at ${size.width}x${size.height}: ${JSON.stringify(playBox)}`);
    assert.equal(await page.locator('.keyboard-shortcuts').isVisible(),false);
    assert.ok(await page.locator('#bpm').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=60));
    await page.screenshot({path:`artifacts/ios-${size.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:834,height:1194});
  await page.locator('#bpm').fill('140');await page.locator('#bpm').press('Tab');
  await page.locator('#play').click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
  await page.waitForFunction(()=>window.iosCalls.some(c=>c.command==='command'&&c.payload.type==='start'));
  const calls=await page.evaluate(()=>window.iosCalls);
  assert.ok(calls.findIndex(c=>c.command==='configure')<calls.findIndex(c=>c.command==='command'&&c.payload.type==='start'));
  assert.ok(calls.some(c=>c.command==='saveSettings'&&c.payload.settings.bpm===140));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ios-clicks',{detail:[{bar:3,beat:2,beatStart:true,bpm:140}]})));
  await page.waitForFunction(()=>document.querySelector('#position').textContent.includes('BAR 03'));
  // Presets while playing are queued through the native tempo command, before the matching config.
  await page.locator('#preset-at-bar').check();
  await page.locator('#preset-gradual').check();
  await page.locator('.preset-button').nth(0).click();
  const presetCalls=await page.evaluate(()=>window.iosCalls.map(c=>c.command).slice(-2));
  assert.deepEqual(presetCalls,['tempo','configure']);
  assert.deepEqual(await page.evaluate(()=>window.iosCalls.filter(c=>c.command==='tempo').map(c=>c.payload)),[{bpm:200,atBar:true,bars:4}]);
  await page.locator('#preset-at-bar').uncheck();await page.locator('#preset-gradual').uncheck();
  // iOS loses localStorage on relaunch (new localhost port), so presets are also saved natively.
  assert.ok(await page.evaluate(()=>window.iosCalls.some(c=>c.command==='savePresets'&&c.payload.presets.list.join()==='200,150')));
  // Immediate change: clicks rendered before it still report the old tempo. They must not pull
  // the display back, or the next +/- step would start from the old tempo.
  const clicks=detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('ios-clicks',{detail})),detail);
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('.preset-button').nth(1).click();
  assert.equal(await page.locator('#bpm').inputValue(),'150');
  await clicks([{bar:3,beat:3,beatStart:true,click:true,bpm:200}]);await frame();
  assert.equal(await page.locator('#bpm').inputValue(),'150');
  await page.locator('#increase').click();
  assert.equal(await page.locator('#bpm').inputValue(),'151');
  await clicks([{bar:4,beat:0,beatStart:true,click:true,bpm:150}]);await frame();
  assert.equal(await page.locator('#bpm').inputValue(),'151');
  await clicks([{bar:4,beat:1,beatStart:true,click:true,bpm:151}]);await frame();
  assert.equal(await page.locator('#bpm').inputValue(),'151');
  // Once confirmed, the engine is the source of truth again.
  await clicks([{bar:4,beat:2,beatStart:true,click:true,bpm:149}]);await frame();
  assert.equal(await page.locator('#bpm').inputValue(),'149');
  await page.locator('#play').click();
  await page.getByRole('button',{name:'Start',exact:true}).waitFor();
  assert.ok((await page.locator('#position').textContent()).includes('BAR 01'));
  assert.ok(await page.evaluate(()=>window.iosCalls.some(c=>c.command==='command'&&c.payload.type==='reset')));
  await page.locator('.preset-button').nth(1).click();
  assert.equal(await page.locator('#bpm').inputValue(),'150');
  await page.locator('#open-update').click();
  assert.ok((await page.locator('#update-status').textContent()).includes('sideload'));
  assert.equal(await page.locator('#install-update').isVisible(),false);
  await page.locator('#check-update').click();
  assert.ok(await page.evaluate(()=>window.iosCalls.some(c=>c.command==='releasePage')));
  await page.locator('#close-update').click();
  await page.locator('#open-export').click();
  await page.locator('#export-length').fill('1');await page.locator('#export-unit').selectOption('seconds');
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='MP3 saved: Click-150bpm.mp3. Files → On My iPad → Click → Exports.');
  assert.ok(await page.evaluate(()=>window.exportBytes>20000));
  await page.evaluate(()=>{window.failExport=true;});
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='Could not export MP3. Please try again.');
  assert.ok(await page.evaluate(()=>window.iosCalls.some(c=>c.command==='cancelExport')));
  await page.evaluate(()=>{window.failExport=false;});
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent.startsWith('MP3 saved:'));
  await page.locator('#close-export').click();
  for(const lang of ['ko','ja','en']){
    await page.locator('#language').selectOption(lang);await page.locator('#open-update').click();
    assert.ok((await page.locator('#check-update').textContent()).includes('GitHub'));
    await page.locator('#close-update').click();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: iPad/iPhone layouts, BPM presets over the native tempo bridge, Stop rewinds, native command ordering, beat display, settings persistence bridge, MP3 export bridge, update guidance and translations.');
} finally {await app.close();}
