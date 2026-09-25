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
      if(command==='command'){
        if(payload.type!=='preview')state.playing=payload.type==='start';
        window.dispatchEvent(new CustomEvent('native-state',{detail:structuredClone(state)}));return state;
      }
      if(command==='beginExport'){bytes=0;return true;}
      if(command==='appendExport'){bytes+=atob(payload.data).length;return true;}
      if(command==='finishExport'){window.exportBytes=bytes;return {saved:true};}
      return true;
    }};
  });
  await page.evaluate(()=>localStorage.clear());await page.reload();
  for(const size of [{width:834,height:1194},{width:1194,height:834},{width:390,height:760},{width:320,height:568}]) {
    await page.setViewportSize(size);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const id of ['#bpm','#play','#reset'])assert.equal(await page.locator(id).isVisible(),true);
    assert.equal(await page.locator('.keyboard-shortcuts').isVisible(),false);
    assert.ok(await page.locator('#bpm').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=60));
    await page.screenshot({path:`artifacts/ios-${size.width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:834,height:1194});
  await page.locator('#bpm').fill('140');await page.locator('#bpm').press('Tab');
  await page.locator('#play').click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await page.waitForFunction(()=>window.iosCalls.some(c=>c.command==='command'&&c.payload.type==='start'));
  const calls=await page.evaluate(()=>window.iosCalls);
  assert.ok(calls.findIndex(c=>c.command==='configure')<calls.findIndex(c=>c.command==='command'&&c.payload.type==='start'));
  assert.ok(calls.some(c=>c.command==='saveSettings'&&c.payload.settings.bpm===140));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ios-clicks',{detail:[{bar:3,beat:2,beatStart:true,bpm:140}]})));
  await page.waitForFunction(()=>document.querySelector('#position').textContent.includes('BAR 03'));
  await page.locator('#play').click();
  await page.locator('#open-update').click();
  assert.ok((await page.locator('#update-status').textContent()).includes('sideload'));
  assert.equal(await page.locator('#install-update').isVisible(),false);
  await page.locator('#check-update').click();
  assert.ok(await page.evaluate(()=>window.iosCalls.some(c=>c.command==='releasePage')));
  await page.locator('#close-update').click();
  await page.locator('#open-export').click();
  await page.locator('#export-length').fill('1');await page.locator('#export-unit').selectOption('seconds');
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='MP3 saved.');
  assert.ok(await page.evaluate(()=>window.exportBytes>20000));
  await page.locator('#close-export').click();
  for(const lang of ['ko','ja','en']){
    await page.locator('#language').selectOption(lang);await page.locator('#open-update').click();
    assert.ok((await page.locator('#check-update').textContent()).includes('GitHub'));
    await page.locator('#close-update').click();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: iPad/iPhone layouts, native command ordering, beat display, settings persistence bridge, MP3 export bridge, update guidance and translations.');
} finally {await app.close();}
