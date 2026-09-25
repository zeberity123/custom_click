const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DesktopClick', {
  saveMp3: (bytes, filename) => ipcRenderer.invoke('save-mp3', bytes, filename),
  updateState: () => ipcRenderer.invoke('update-state'),
  updateAction: command => ipcRenderer.invoke('update-action', command),
});
