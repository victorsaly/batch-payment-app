const { contextBridge, ipcRenderer } = require('electron');

// A small, explicit bridge. The renderer (UI) can ONLY call these functions —
// it has no direct filesystem or Node access, which keeps the app safe.
contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  dataStatus: () => ipcRenderer.invoke('data:status'),
  exportData: (password) => ipcRenderer.invoke('data:export', password),
  importData: (opts) => ipcRenderer.invoke('data:import', opts),
  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  importFile: () => ipcRenderer.invoke('file:import'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  appVersion: () => ipcRenderer.invoke('app:version'),
  changelog: () => ipcRenderer.invoke('app:changelog'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  // Auto-update (electron-updater). onUpdateEvent forwards only the payload, not
  // the raw IPC event, to keep the renderer sandbox clean.
  updateSupported: () => ipcRenderer.invoke('update:supported'),
  checkForUpdatesAuto: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (cb) => ipcRenderer.on('update:event', (_e, payload) => cb(payload)),
  logError: (info) => ipcRenderer.invoke('error:log', info),
  listErrors: () => ipcRenderer.invoke('error:list'),
  revealErrorLog: () => ipcRenderer.invoke('error:reveal'),
  clearErrors: () => ipcRenderer.invoke('error:clear')
});
