import { packager } from '@electron/packager';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8'));
const localZip = path.resolve('.electron-cache', `electron-v${version}-win32-x64.zip`);

const outputs = await packager({
  dir: '.', name: 'Click', executableName: 'Click',
  platform: 'win32', arch: 'x64', out: 'release', overwrite: true,
  icon: 'src/assets/icon.ico',
  tmpdir: path.resolve('artifacts/package-temp'),
  download: { cacheRoot: path.resolve('.electron-cache') },
  electronZipDir: existsSync(localZip) ? path.dirname(localZip) : undefined,
  ignore: [/^\/(android|release|tests|scripts|artifacts|\.android-sdk|\.toolchains|\.gradle-cache|\.npm-cache|\.electron-cache|\.builder-cache|\.git)(\/|$)/],
  win32metadata: { CompanyName: 'Click Studio', FileDescription: 'Click — Desktop Metronome', ProductName: 'Click' },
});
for (const output of outputs) console.log(`Built ${output}`);
