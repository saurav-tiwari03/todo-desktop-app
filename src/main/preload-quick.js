'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quick', {
  add: (task) => ipcRenderer.send('quick:add', task),
  close: () => ipcRenderer.send('quick:close'),
  resize: (height) => ipcRenderer.send('quick:resize', height),
  setVoice: (on) => ipcRenderer.send('quick:voice', Boolean(on)),
  onOpen: (handler) => ipcRenderer.on('quick:open', (_event, payload) => handler(payload))
});
