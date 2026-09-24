import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

export async function launchPortable(env) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const folder = path.resolve('artifacts/portable-single-file');
  const temp = path.resolve('artifacts/portable-temp');
  await mkdir(folder, { recursive: true });
  await mkdir(temp, { recursive: true });
  const executable = path.join(folder, 'Custom-Click.exe');
  await copyFile(`release/portable/Custom-Click-${version}-win-x64.exe`, executable);
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + path.resolve('artifacts/portable-profile'),
  ], { cwd: folder, env: { ...env, TEMP: temp, TMP: temp }, windowsHide: true, stdio: 'ignore' });
  let launchError;
  child.on('error', error => { launchError = error; });
  let browser;
  const deadline = Date.now() + 60000;
  while (!browser && Date.now() < deadline) {
    if (launchError) throw launchError;
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!browser) { child.kill(); throw new Error('Portable executable did not open its test connection within 60 seconds.'); }
  return {
    async firstWindow() {
      const context = browser.contexts()[0];
      return context.pages()[0] ?? await context.waitForEvent('page');
    },
    async close() {
      const session = await browser.newBrowserCDPSession();
      await session.send('Browser.close').catch(() => {});
      await browser.close();
    },
  };
}
