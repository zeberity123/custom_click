const { app, BrowserWindow, protocol, net, powerSaveBlocker } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'click', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true,
} }]);

let window;
app.whenReady().then(() => {
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
      title: 'Click — Metronome', backgroundColor: '#101513', autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadURL('click://app/index.html');
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
