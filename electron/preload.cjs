const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Controles de ventana frameless
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleMiniPlayer: () => ipcRenderer.invoke('window:toggleMiniPlayer'),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window:state-changed', (_event, state) => callback(state));
  },

  // Atajos multimedia globales del sistema
  onMediaKey: (callbacks) => {
    if (callbacks.toggle) ipcRenderer.on('media-key:toggle', () => callbacks.toggle());
    if (callbacks.next) ipcRenderer.on('media-key:next', () => callbacks.next());
    if (callbacks.prev) ipcRenderer.on('media-key:prev', () => callbacks.prev());
  },

  // Notificaciones y Explorador de Windows
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  notifyTrack: (info) => ipcRenderer.invoke('app:notifyTrack', info),

  // Diálogos del sistema y gestión de biblioteca
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openFilesDialog: () => ipcRenderer.invoke('dialog:openFiles'),
  getDefaultMusicDir: () => ipcRenderer.invoke('music:getDefaultMusicDir'),
  scanFolder: (folderPath) => ipcRenderer.invoke('music:scanFolder', folderPath),
  parseFiles: (filePaths) => ipcRenderer.invoke('music:parseFiles', filePaths),
  getSampleMusic: () => ipcRenderer.invoke('music:getSampleMusic'),

  // Generador de URL de streaming local seguro
  getAudioStreamUrl: (filePath) => {
    return `local-audio://stream?path=${encodeURIComponent(filePath)}`;
  },

  // Descargas offline en disco
  saveDownloadedTrack: (data) => ipcRenderer.invoke('offline:saveTrack', data),
  getDownloadsDir: () => ipcRenderer.invoke('offline:getDownloadsDir'),
  deleteDownloadedTrack: (filePath) => ipcRenderer.invoke('offline:deleteTrack', filePath)
});
