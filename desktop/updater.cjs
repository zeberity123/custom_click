const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const REPO = 'zeberity123/custom_click';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const MAX_SIZE = 250_000_000;

function versionParts(version) {
  if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) throw new Error('release');
  return version.split('.').map(Number);
}
function newer(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function selectRelease(release, current) {
  const version = String(release.tag_name || '').replace(/^v/, '');
  versionParts(version);
  if (release.draft || release.prerelease) throw new Error('release');
  if (!newer(version, current)) return null;
  const name = `Custom-Click-${version}-win-x64.exe`;
  const asset = release.assets?.find(item => item.name === name);
  const url = `https://github.com/${REPO}/releases/download/v${version}/${name}`;
  if (!asset || asset.state !== 'uploaded' || asset.browser_download_url !== url ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_SIZE ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('release');
  return { version, name, url, size: asset.size, hash: asset.digest.slice(7) };
}
function allowedURL(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && (!parsed.port || parsed.port === '443') &&
    ['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname);
}
async function request(url, fetcher = fetch) {
  for (let redirects = 0; redirects < 6; redirects++) {
    if (!allowedURL(url)) throw new Error('release');
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Custom-Click-Updater', 'Accept': 'application/vnd.github+json' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('network');
      url = new URL(location, url).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 403 || response.status === 429 ? 'rate' : 'network'); }
    return response;
  }
  throw new Error('network');
}
async function download(asset, destination, progress, fetcher = fetch) {
  const response = await request(asset.url, fetcher);
  const temporary = destination + '.part';
  let handle;
  try {
    handle = await fs.open(temporary, 'w');
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > asset.size || bytes > MAX_SIZE) throw new Error('integrity');
      hash.update(chunk); await handle.writeFile(chunk);
      progress(Math.floor(bytes * 100 / asset.size));
    }
    if (bytes !== asset.size || hash.digest('hex') !== asset.hash) throw new Error('integrity');
    await handle.close(); handle = null;
    await fs.rename(temporary, destination);
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }); }
}
function createUpdater(app, shell, fetcher = fetch) {
  let state = { status: 'idle', current: app.getVersion(), platform: 'windows' }, asset, downloaded;
  const folder = path.join(app.getPath('userData'), 'updates');
  const fail = error => { state = { ...state, status: 'error', error: ['release','integrity','rate'].includes(error.message) ? error.message : 'network' }; };
  async function action(command) {
    if (['checking','downloading','installing'].includes(state.status)) return state;
    if (command === 'check') {
      state = { status: 'checking', current: app.getVersion(), platform: 'windows' }; asset = null; downloaded = null;
      try {
        const response = await request(API, fetcher);
        let body = '';
        for await (const chunk of response.body) {
          body += Buffer.from(chunk).toString('utf8');
          if (body.length > 2_000_000) throw new Error('release');
        }
        asset = selectRelease(JSON.parse(body), app.getVersion());
        state = { ...state, status: asset ? 'available' : 'current', version: asset?.version };
      } catch (error) { fail(error); }
    } else if (command === 'download' && state.status === 'available' && asset) {
      state = { ...state, status: 'downloading', progress: 0 };
      try {
        await fs.mkdir(folder, { recursive: true });
        downloaded = path.join(folder, asset.name);
        await download(asset, downloaded, value => { state.progress = value; }, fetcher);
        state = { ...state, status: 'ready' };
      } catch (error) { downloaded = null; fail(error); }
    } else if (command === 'install' && state.status === 'ready' && downloaded) {
      state = { ...state, status: 'installing' };
      try {
        if (createHash('sha256').update(await fs.readFile(downloaded)).digest('hex') !== asset.hash) throw new Error('integrity');
        const target = process.env.PORTABLE_EXECUTABLE_FILE;
        if (app.isPackaged && target && path.isAbsolute(target) && path.extname(target).toLowerCase() === '.exe') {
          // Copy the helper outside the temporary portable runtime before quitting.
          const helper = path.join(folder, 'install-update.ps1');
          await fs.copyFile(path.join(__dirname, 'install-update.ps1'), helper);
          const config = path.join(folder, 'install-update.json');
          await fs.writeFile(config, JSON.stringify({ source: downloaded, target, hash: asset.hash, processId: process.pid }));
          const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',helper,'-ConfigPath',config],
            { detached: true, windowsHide: true, stdio: 'ignore' });
          await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
          child.unref(); app.quit();
        } else {
          const error = await shell.openPath(downloaded);
          if (error) throw new Error('install');
          app.quit();
        }
      } catch (error) { state = { ...state, status: 'error', error: error.message === 'integrity' ? 'integrity' : 'install' }; }
    }
    return { ...state };
  }
  return { action, snapshot: () => ({ ...state }) };
}
module.exports = { createUpdater, selectRelease, newer, allowedURL, download };
