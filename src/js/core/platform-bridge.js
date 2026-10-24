// Capa de Abstracción Multiplataforma (Electron IPC + Capacitor Android + Web Móvil)
import { memoryManager } from './memory-manager.js';

class PlatformBridge {
  constructor() {
    // @ts-ignore
    this.isElectron = typeof window !== 'undefined' && !!window.electronAPI;
    // @ts-ignore
    this.isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform());
    this.isMobile = typeof navigator !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth <= 768)
    );

    /** @type {Map<string, File>} */
    this._webFileMap = new Map();
  }

  // ==========================================
  // Diálogos de Archivos y Carpetas
  // ==========================================

  async openFiles() {
    if (this.isElectron) {
      // @ts-ignore
      const filePaths = await window.electronAPI.openFilesDialog();
      // @ts-ignore
      return filePaths?.length ? await window.electronAPI.parseFiles(filePaths) : [];
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac';
      input.onchange = async (e) => {
        // @ts-ignore
        const files = Array.from(e.target?.files || []);
        resolve(files.length ? await this._processWebAudioFiles(files) : []);
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  async openFolder() {
    if (this.isElectron) {
      // @ts-ignore
      const folderPath = await window.electronAPI.openFolderDialog();
      // @ts-ignore
      return { folderPath, tracks: folderPath ? await window.electronAPI.scanFolder(folderPath) : [] };
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      // @ts-ignore
      input.webkitdirectory = input.directory = input.multiple = true;
      input.onchange = async (e) => {
        // @ts-ignore
        const files = Array.from(e.target?.files || []).filter(f => f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(f.name));
        if (!files.length) return resolve({ folderPath: null, tracks: [] });
        // @ts-ignore
        const firstPath = files[0].webkitRelativePath?.split('/')[0] || 'Carpeta Local';
        resolve({ folderPath: firstPath, tracks: await this._processWebAudioFiles(files) });
      };
      input.oncancel = () => resolve({ folderPath: null, tracks: [] });
      input.click();
    });
  }

  async scanDefaultMusicDir() {
    if (this.isElectron) {
      // @ts-ignore
      const musicDir = await window.electronAPI.getDefaultMusicDir();
      // @ts-ignore
      const tracks = musicDir ? await window.electronAPI.scanFolder(musicDir) : [];
      return { folderPath: musicDir, tracks };
    }
    return { folderPath: null, tracks: [] };
  }

  async getSampleMusic() {
    // @ts-ignore
    return (this.isElectron && window.electronAPI?.getSampleMusic) ? await window.electronAPI.getSampleMusic() : [];
  }

  async parseDroppedFiles(fileList) {
    if (!fileList || !fileList.length) return [];
    if (this.isElectron) {
      const paths = Array.from(fileList).map(f => f.path).filter(Boolean);
      // @ts-ignore
      if (paths.length > 0) return await window.electronAPI.parseFiles(paths);
    }
    const files = Array.from(fileList).filter(f => f.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(f.name));
    return await this._processWebAudioFiles(files);
  }

  // ==========================================
  // URL de Streaming de Audio
  // ==========================================

  getAudioStreamUrl(track) {
    if (!track) return '';
    if (this.isElectron && track.path && !track.path.startsWith('blob:') && !track.path.startsWith('http')) {
      // @ts-ignore
      return window.electronAPI.getAudioStreamUrl(track.path);
    }
    if (this._webFileMap.has(track.id)) {
      const file = this._webFileMap.get(track.id);
      if (file) return memoryManager.createTrackUrl(file);
    }
    return track.path || '';
  }

  // ==========================================
  // Ventana y Notificaciones Multiplataforma
  // ==========================================

  async minimizeWindow() {
    // @ts-ignore
    if (this.isElectron) await window.electronAPI.minimizeWindow();
  }

  async maximizeWindow() {
    // @ts-ignore
    if (this.isElectron) return await window.electronAPI.maximizeWindow();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  async closeWindow() {
    // @ts-ignore
    if (this.isElectron) window.electronAPI.closeWindow();
  }

  async toggleMiniPlayer() {
    // @ts-ignore
    if (this.isElectron) return await window.electronAPI.toggleMiniPlayer();
    document.body.classList.toggle('mini-mode');
  }

  onWindowStateChanged(callback) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.onWindowStateChanged) {
      // @ts-ignore
      window.electronAPI.onWindowStateChanged(callback);
    }
  }

  onMediaKey(callbacks) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.onMediaKey) {
      // @ts-ignore
      window.electronAPI.onMediaKey(callbacks);
    }
  }

  showItemInFolder(filePath) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.showItemInFolder) {
      // @ts-ignore
      window.electronAPI.showItemInFolder(filePath);
    }
  }

  notifyTrack({ title, artist }) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.notifyTrack) {
      // @ts-ignore
      window.electronAPI.notifyTrack({ title, artist });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title || 'Aura Music Player', { body: artist || 'Reproduciendo', silent: true });
      } catch (e) {}
    }
  }

  async saveDownloadedTrack(data) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.saveDownloadedTrack) {
      // @ts-ignore
      return await window.electronAPI.saveDownloadedTrack(data);
    }
    return { success: false };
  }

  async deleteDownloadedTrack(filePath) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.deleteDownloadedTrack) return await window.electronAPI.deleteDownloadedTrack(filePath);
    return false;
  }

  async getYoutubeStream(data) {
    // @ts-ignore
    if (this.isElectron && window.electronAPI?.getYoutubeStream) return await window.electronAPI.getYoutubeStream(data);
    return null;
  }

  // ==========================================
  // Procesador Interno de Archivos Web/Móvil
  // ==========================================

  async _processWebAudioFiles(files) {
    const tracks = [];
    for (const file of files) {
      const id = 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const name = file.name.replace(/\.[^/.]+$/, "");
      const ext = (file.name.split('.').pop() || 'mp3').toUpperCase();
      this._webFileMap.set(id, file);

      const track = {
        id, title: name, artist: 'Artista Desconocido', album: 'Biblioteca Local',
        duration: 0, path: file.name, fileName: file.name, format: ext, cover: null
      };

      if (name.includes(' - ')) {
        const parts = name.split(' - ');
        track.artist = parts[0].trim();
        track.title = parts.slice(1).join(' - ').trim();
      }

      try {
        const tempUrl = URL.createObjectURL(file);
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = tempUrl;
        await new Promise((res) => {
          const done = () => { URL.revokeObjectURL(tempUrl); res(null); };
          audio.onloadedmetadata = () => { if (audio.duration > 0) track.duration = Math.round(audio.duration); done(); };
          audio.onerror = done;
          setTimeout(done, 1000);
        });
      } catch {}
      tracks.push(track);
    }
    return tracks;
  }
}

export const platform = new PlatformBridge();
