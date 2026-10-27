// The only native features the game page can reach.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  achieve: (id) => ipcRenderer.invoke('achieve', String(id)),
  setFullscreen: (on) => ipcRenderer.send('fullscreen', !!on),
  quit: () => ipcRenderer.send('quit'),
});
