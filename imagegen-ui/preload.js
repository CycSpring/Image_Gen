const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  runImageGen: (args, envs) => ipcRenderer.invoke('run-imagegen', args, envs),
  cancelImageGen: () => ipcRenderer.invoke('cancel-imagegen'),
  saveTempFile: (fileName, arrayBuffer) => ipcRenderer.invoke('save-temp-file', fileName, arrayBuffer),
  cleanupTempFiles: () => ipcRenderer.invoke('cleanup-temp-files'),
  readImageBase64: (filePath) => ipcRenderer.invoke('read-image-base64', filePath),
  onLog: (callback) => {
    const listener = (event, value) => callback(value);
    ipcRenderer.on('log-data', listener);
    return () => ipcRenderer.removeListener('log-data', listener);
  },
  onMenuRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('menu-refresh-config', listener);
    return () => ipcRenderer.removeListener('menu-refresh-config', listener);
  },
  onShowPolicyModal: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('menu-show-policy', listener);
    return () => ipcRenderer.removeListener('menu-show-policy', listener);
  }
});
