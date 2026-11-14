'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
