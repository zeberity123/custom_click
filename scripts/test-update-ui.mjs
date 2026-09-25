import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.','--user-data-dir='+path.resolve('artifacts/update-ui-profile')],env});
try {
  const page=await app.firstWindow(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>localStorage.clear());await page.reload();
  // Read-only check through the real native desktop bridge; no installation is triggered.
  await page.locator('#open-update').click();
  await page.waitForFunction(()=>document.querySelector('#update-status').textContent==='You have the latest version.',{},{timeout:40000});
  assert.ok((await page.locator('#update-version').textContent()).includes(version));
  await page.locator('#close-update').click();
  await page.addInitScript(()=>{
    let state={status:'idle',current:'0.5.0',platform:'android'};
    window.updateCommands=[];
    window.NativeClick={ready:()=>true,snapshot:()=>JSON.stringify({config:{bpm:126},playing:false}),clock:()=>0,configure:()=>{},command:()=>{},
      updateState:()=>JSON.stringify(state),updateAction:command=>{
        window.updateCommands.push(command);
        state={...state,status:command==='check'?'available':command==='download'?'ready':'permission',version:'0.6.0'};
      }};
    window.setUpdateState=value=>{state={...state,...value};};
  });
  await page.reload();
  await page.setViewportSize({width:320,height:568});
  const update=await page.locator('#open-update').boundingBox(),exp=await page.locator('#open-export').boundingBox();
  assert.ok(update.x<exp.x && update.x>=0 && exp.x+exp.width<=320);
  await page.locator('#open-update').click();
  await page.locator('#download-update').waitFor({state:'visible'});
  await page.locator('#update-title').evaluate(node=>{node.tabIndex=-1;node.focus();});
  await page.keyboard.press('Space');assert.equal(await page.locator('#play-label').textContent(),'Start');
  await page.locator('#download-update').click();await page.locator('#install-update').waitFor({state:'visible'});
  await page.locator('#install-update').click();
  await page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('Allow updates'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#update-dialog').evaluate(node=>node.open),false);
  for(const [lang,button] of [['ko','업데이트'],['ja','更新'],['en','Update']]) {
    await page.locator('#language').selectOption(lang);assert.equal(await page.locator('#open-update').textContent(),button);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.evaluate(()=>window.setUpdateState({status:'error',error:'integrity'}));
  await page.locator('#open-update').click();await page.locator('#download-update').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>window.updateCommands),['check','download','install','check']);
  assert.deepEqual(errors,[]);
  console.log('PASS: native desktop version check, update placement, download/install states, Android permission guidance, keyboard isolation, retry, translations and narrow layout.');
} finally {await app.close();}
