const { app, BrowserWindow, protocol, net, powerSaveBlocker, ipcMain, dialog, shell } = require('electron');
const { createUpdater } = require('./updater.cjs');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'click', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true,
} }]);

let window;
let saving = false;
app.whenReady().then(() => {
  const updater = createUpdater(app, shell);
  const trusted = event => event.sender === window?.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame.url.startsWith('click://app/');
  ipcMain.handle('update-state', event => trusted(event) ? updater.snapshot() : null);
  ipcMain.handle('update-action', (event, command) => trusted(event) && ['check','download','install'].includes(command) ? updater.action(command) : null);
  ipcMain.handle('save-mp3', async (event, bytes, filename) => {
    if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith('click://app/') || !(bytes instanceof ArrayBuffer) || bytes.byteLength < 1 || bytes.byteLength > 90000000 || saving) return { error: true };
    saving = true;
    try {
      const name = typeof filename === 'string' && /^Click-\d{1,3}bpm\.mp3$/.test(filename) ? filename : 'Click.mp3';
      const result = await dialog.showSaveDialog(window, { defaultPath: path.join(app.getPath('downloads'), name), filters: [{name:'MP3',extensions:['mp3']}] });
      if (result.canceled || !result.filePath) return { cancelled: true };
      await writeFile(result.filePath, Buffer.from(bytes));
      return { saved: true };
    } catch { return { error: true }; }
    finally { saving = false; }
  });
  const root = path.resolve(__dirname, '../src');
  protocol.handle('click', request => {
    const url = new URL(request.url);
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.host !== 'app' || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  powerSaveBlocker.start('prevent-app-suspension');
  function createWindow() {
    window = new BrowserWindow({
      width: 1100, height: 880, minWidth: 390, minHeight: 650,
      title: 'Click — Metronome', backgroundColor: '#0d1718', autoHideMenuBar: true,
      icon: path.join(root, 'assets/icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadURL('click://app/index.html');
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
