import { _electron as electron } from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';
// iPad (touch) layouts must never scroll: 11" landscape usable area and portrait, across languages and states.
const failures=[];
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.','--user-data-dir='+path.resolve('artifacts/ipad-fit-profile')],env});
const page=await app.firstWindow();
await page.addInitScript(()=>{window.IOSClick={call:async(c,p)=>{if(c==='ready')return{config:{},playing:false};if(c==='command'){setTimeout(()=>window.dispatchEvent(new CustomEvent('native-state',{detail:{playing:p.type==='start'}})),0);return{playing:p.type==='start'};}return true;}};});
const cdp=await page.context().newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await page.evaluate(()=>localStorage.clear()); await page.reload(); await page.waitForSelector('#presets .preset-button');
const sizes=[[1194,786],[834,1150]];
async function check(label){
  for(const [w,h] of sizes){
    await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(250);
    const r=await page.evaluate(()=>({sh:document.documentElement.scrollHeight,ih:innerHeight}));
    console.log((r.sh<=r.ih?'OK  ':'OVER'),label.padEnd(34),`${w}x${h}`,'height',r.sh,'/',r.ih);
    if(r.sh>r.ih) failures.push(label+' '+w+'x'+h); if(r.sh>r.ih) await page.screenshot({path:`artifacts/over-${label.replace(/\W+/g,'_')}-${w}.png`});
  }
}
await check('default (en)');
for(const lang of ['ko','ja']){ await page.locator('#language').selectOption(lang); await check('language '+lang); }
await page.locator('#language').selectOption('ko');
await page.locator('#numerator').fill('12'); await page.locator('#numerator').press('Tab');
await check('ko 12 beats');
await page.locator('#numerator').fill('7'); await page.locator('#numerator').press('Tab');
await check('ko 7 beats');
await page.locator('#numerator').fill('4'); await page.locator('#numerator').press('Tab');
await page.locator('#automation-enabled').click();
await check('ko automation on');
await page.locator('#play').click(); await page.waitForTimeout(200);
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ios-clicks',{detail:[{bar:2,beat:0,beatStart:true,bpm:131}]})));
await check('ko playing + automation (live)');
await page.locator('#automation-enabled').click();
await page.locator('#preset-at-bar').check();
await page.locator('.preset-button').nth(0).click();
await check('ko playing + pending preset (→)');
await page.evaluate(()=>{const e=document.querySelector('#error');e.textContent='오디오가 중단되었습니다. 시작을 눌러 다시 재생하세요.';e.hidden=false;});
await check('ko error banner shown');
await app.close();
assert.deepEqual(failures,[]);
console.log('PASS: iPad layouts fit without scrolling (default, ko/ja, 7/12 beats, automation, pending preset, error banner).');
