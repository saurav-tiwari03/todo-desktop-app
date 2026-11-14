'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quick', {
  add: (task) => ipcRenderer.send('quick:add', task),
  close: () => ipcRenderer.send('quick:close'),
  resize: (height) => ipcRenderer.send('quick:resize', height),
  setVoice: (on) => ipcRenderer.send('quick:voice', Boolean(on)),
  openDictationSettings: () => ipcRenderer.send('quick:dictation-settings'),
  speechAvailable: () => ipcRenderer.invoke('speech:available'),
  warmSpeech: () => ipcRenderer.invoke('speech:warm'),
  transcribe: (samples) => ipcRenderer.invoke('speech:transcribe', samples),
  onOpen: (handler) => ipcRenderer.on('quick:open', (_event, payload) => handler(payload))
});
