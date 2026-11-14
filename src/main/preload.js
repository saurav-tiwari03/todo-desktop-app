'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const menuChannels = ['menu:new-task', 'menu:new-project', 'menu:search', 'menu:view', 'menu:focus-task'];

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),

  addTask: (input) => ipcRenderer.invoke('task:add', input),
  completeTask: (id) => ipcRenderer.invoke('task:complete', id),
  updateTask: (id, patch) => ipcRenderer.invoke('task:update', id, patch),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),
  clearCompleted: () => ipcRenderer.invoke('task:clear-completed'),

  addProject: (input) => ipcRenderer.invoke('project:add', input),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),

  addComment: (taskId, input) => ipcRenderer.invoke('comment:add', taskId, input),
  updateComment: (taskId, commentId, text) => ipcRenderer.invoke('comment:update', taskId, commentId, text),
  deleteComment: (taskId, commentId) => ipcRenderer.invoke('comment:delete', taskId, commentId),
  deleteAttachment: (taskId, commentId, attachmentId) =>
    ipcRenderer.invoke('attachment:delete', taskId, commentId, attachmentId),

  pickAttachments: () => ipcRenderer.invoke('attachment:pick'),
  openAttachment: (file) => ipcRenderer.invoke('attachment:open', file),
  revealAttachment: (file) => ipcRenderer.invoke('attachment:reveal', file),

  // Electron 32 removed File.path; this is the supported way to learn where a
  // dropped file actually lives.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },

  openDictationSettings: () => ipcRenderer.invoke('dictation:settings'),

  speechAvailable: () => ipcRenderer.invoke('speech:available'),
  warmSpeech: () => ipcRenderer.invoke('speech:warm'),
  transcribe: (samples) => ipcRenderer.invoke('speech:transcribe', samples),

  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  onStateChange: (handler) => {
    ipcRenderer.on('state:changed', (_event, state) => handler(state));
  },

  onMenu: (handler) => {
    for (const channel of menuChannels) {
      ipcRenderer.on(channel, (_event, payload) => handler(channel, payload));
    }
  }
});
