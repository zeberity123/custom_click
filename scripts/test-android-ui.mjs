import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', '--user-data-dir=' + path.resolve('artifacts/android-ui-profile')], env });
try {
  const page = await app.firstWindow();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    let config = { bpm:126,numerator:4,denominator:4,note:'eighth',volume:65,pan:0,accents:[true,true,true,true] };
    let playing=false;
    let exportBytes=0;
    window.nativeCalls=[];
    window.NativeClick={beginExport:()=>{exportBytes=0;return true;},appendExport:chunk=>{exportBytes+=atob(chunk).length;return true;},finishExport:filename=>{window.nativeCalls.push({type:'export',filename,bytes:exportBytes});setTimeout(()=>window.dispatchEvent(new CustomEvent('native-export',{detail:{saved:true}})),20);return true;},cancelExport:()=>{},ready:()=>true,clock:()=>performance.now()/1000,snapshot:()=>JSON.stringify({config,playing,error:''}),configure:json=>{config=JSON.parse(json);},command:(type,high)=>{
      window.nativeCalls.push({type,high});
      if(type==='preview')return;
      playing=type==='start';window.dispatchEvent(new CustomEvent('native-state',{detail:{config,playing,error:''}}));
    }};
  });
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({width:390,height:760});await page.reload();
  await page.waitForFunction(()=>document.documentElement.classList.contains('android'));
  assert.equal(await page.locator('#language').inputValue(),'en');
  assert.equal(await page.locator('#bpm').inputValue(),'126');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#39c5bb');
  for (const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:760},{width:844,height:320}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo(0, 0));
    for (const selector of ['.brand', '#bpm', '#play', '#reset']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width, `${selector} is outside ${JSON.stringify(viewport)}: ${JSON.stringify(box)}`);
    }
    assert.equal(await page.locator('.page-heading').isVisible(), false);
    await page.locator('#settings-drawer').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:390,height:760});
  await page.locator('#open-settings').click();
  await page.locator('#settings-drawer').waitFor({state:'visible'});
  assert.equal(await page.locator('#open-settings').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#waveform, #preview-high, #preview-low, .sample-card').count(), 0);
  await page.locator('[data-note="triplet-skip"]').click();
  await page.locator('#volume').fill('42');
  assert.equal(await page.locator('#volume-value').textContent(), '42%');
  await page.locator('#pan').fill('-50');
  assert.equal(await page.locator('#pan-value').textContent(), '50% left');
  await page.locator('#center-pan').click();
  assert.equal(await page.locator('#pan-value').textContent(), 'Center');
  await page.screenshot({path:'artifacts/android-drawer.png'});
  await page.locator('#close-settings').click();
  await page.locator('#settings-drawer').waitFor({state:'hidden'});
  await page.locator('#play').click();
  await page.getByRole('button',{name:'Pause'}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('native-click',{detail:{time:0,beat:2,bar:3,beatStart:true,click:true,high:true}})));
  await page.waitForFunction(()=>document.querySelector('#position').textContent.includes('BAR 03'));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('native-state',{detail:{playing:false,message:'Audio focus lost.'}})));
  await page.getByRole('button',{name:'Resume'}).waitFor();
  await page.locator('.beat-button').first().click();
  assert.ok(await page.evaluate(()=>window.nativeCalls.some(call=>call.type==='preview' && !call.high)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#error').evaluate(element=>element.hidden=true);
  await page.locator('#reset').click();
  await page.screenshot({path:'artifacts/android-ui.png',fullPage:true});
  // Actual touch input: swipe on blank panel space, then return from the drawer heading.
  const cdp = await page.context().newCDPSession(page);
  async function swipe(x1, x2, y) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:x1,y}]});
    for (let step=1;step<=6;step++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x1+(x2-x1)*step/6,y}]});
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  }
  await swipe(280, 90, 120);
  await page.locator('#settings-drawer').waitFor({state:'visible'});
  await page.locator('#close-settings').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#automation-enabled').evaluate(element=>element===document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#close-settings').evaluate(element=>element===document.activeElement),true);
  await swipe(90, 280, 40);
  await page.locator('#settings-drawer').waitFor({state:'hidden'});
  await page.locator('#open-settings').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#open-settings').evaluate(element=>element===document.activeElement),true);
  await page.locator('#open-settings').click();
  await page.locator('#drawer-backdrop').click({position:{x:5,y:200}});
  await page.locator('#settings-drawer').waitFor({state:'hidden'});
  await page.locator('#open-settings').click();
  await page.locator('#numerator').fill('12');
  await page.locator('#numerator').press('Tab');
  await page.locator('#denominator').selectOption('8');
  await page.locator('#close-settings').click();
  await page.locator('#settings-drawer').waitFor({state:'hidden'});
  await page.setViewportSize({width:320,height:568});
  const playBox = await page.locator('#play').boundingBox();
  assert.ok(playBox.y+playBox.height<=568);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/android-small.png',fullPage:true});
  await page.locator('#open-export').click();
  await page.locator('#export-length').fill('1');
  await page.locator('#export-unit').selectOption('seconds');
  await page.locator('#save-export').click();
  await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='MP3 saved.');
  const exported=await page.evaluate(()=>window.nativeCalls.find(call=>call.type==='export'));
  assert.equal(exported.filename,'Click-126bpm.mp3');
  assert.ok(exported.bytes>20000);
  await page.locator('#close-export').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: Android bridge playback, beat sync, compact layouts, pinned transport, drawer touch swipes, focus/escape/backdrop, volume/pan, and 12-beat layout (host simulation; not an Android device test).');
} finally {await app.close();}
