import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import updater from '../desktop/updater.cjs';

const data = Buffer.from('fixture executable data');
const hash = createHash('sha256').update(data).digest('hex');
const release = () => ({ tag_name: 'v0.6.0', draft: false, prerelease: false, assets: [{ name: 'Custom-Click-0.6.0-win-x64.exe', state: 'uploaded', size: data.length, digest: 'sha256:'+hash, browser_download_url: 'https://github.com/zeberity123/custom_click/releases/download/v0.6.0/Custom-Click-0.6.0-win-x64.exe' }] });
test('updates compare numeric versions and refuse incompatible releases or untrusted asset URLs', () => {
  assert.equal(updater.newer('0.10.0','0.9.9'),true);
  assert.equal(updater.selectRelease(release(),'0.6.0'),null);
  assert.equal(updater.selectRelease(release(),'1.0.0'),null);
  assert.equal(updater.selectRelease(release(),'0.5.0').version,'0.6.0');
  for(const mutate of [r=>r.prerelease=true,r=>r.tag_name='v0.6.0-beta',r=>r.assets=[],r=>r.assets[0].digest='',r=>r.assets[0].size=300_000_000,r=>r.assets[0].browser_download_url='https://example.com/update.exe']) {
    const r=release();mutate(r);assert.throws(()=>updater.selectRelease(r,'0.5.0'));
  }
  assert.equal(updater.allowedURL('https://github.com.attacker.invalid/update.exe'),false);
  assert.equal(updater.allowedURL('http://github.com/update.exe'),false);
  assert.equal(updater.allowedURL('https://user:pass@github.com/update.exe'),false);
});
test('downloads verify exact size and hash, reject unsafe redirects, and remove partial files', async () => {
  const folder=await mkdtemp(path.join(tmpdir(),'click-update-test-'));
  try {
    const asset=updater.selectRelease(release(),'0.5.0'), output=path.join(folder,'update.exe');
    const progress=[];
    await updater.download(asset,output,value=>progress.push(value),async()=>new Response(data));
    assert.deepEqual(await readFile(output),data);assert.equal(progress.at(-1),100);
    for(const bytes of [Buffer.from('corrupt'),Buffer.alloc(data.length),Buffer.alloc(data.length+1)]) {
      await assert.rejects(updater.download(asset,path.join(folder,'bad.exe'),()=>{},async()=>new Response(bytes)),/integrity/);
      assert.deepEqual(await readdir(folder),['update.exe']);
    }
    await assert.rejects(updater.download(asset,output,()=>{},async()=>new Response(null,{status:302,headers:{location:'http://example.com/update.exe'}})),/release/);
    await assert.rejects(updater.download(asset,output,()=>{},async()=>new Response(null,{status:403})),/rate/);
  } finally { await rm(folder,{recursive:true,force:true}); }
});
test('updater keeps downloaded files private and prevents duplicate operations', async () => {
  const folder=await mkdtemp(path.join(tmpdir(),'click-update-state-'));
  try {
    let releaseCheck;
    const fetcher=url=>url.includes('/releases/latest') ? new Promise(resolve=>{releaseCheck=()=>resolve(Response.json(release()));}) : Promise.resolve(new Response(data));
    const instance=updater.createUpdater({getVersion:()=> '0.5.0',getPath:()=>folder}, {},fetcher);
    const check=instance.action('check');
    assert.equal((await instance.action('check')).status,'checking');releaseCheck();await check;
    assert.equal(instance.snapshot().status,'available');
    await instance.action('download');assert.equal(instance.snapshot().status,'ready');
    assert.equal(Object.hasOwn(instance.snapshot(),'url'),false);
    assert.deepEqual(await readFile(path.join(folder,'updates',release().assets[0].name)),data);
  } finally { await rm(folder,{recursive:true,force:true}); }
});
