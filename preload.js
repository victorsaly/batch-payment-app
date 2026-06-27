const { contextBridge, ipcRenderer } = require('electron');

// A small, explicit bridge. The renderer (UI) can ONLY call these functions —
// it has no direct filesystem or Node access, which keeps the app safe.
contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  dataStatus: () => ipcRenderer.invoke('data:status'),
  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  importFile: () => ipcRenderer.invoke('file:import'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  appVersion: () => ipcRenderer.invoke('app:version'),
  changelog: () => ipcRenderer.invoke('app:changelog'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update')
});
