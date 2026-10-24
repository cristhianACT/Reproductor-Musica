import { memoryManager } from './core/memory-manager.js';

// Gestión de persistencia local (LocalStorage)
const STORAGE_KEYS = {
  TRACKS_CACHE: 'spoty_tracks_cache',
  FOLDERS: 'spoty_folders',
  FAVORITES: 'spoty_favorites',
  PLAYLISTS: 'spoty_playlists',
  SETTINGS: 'spoty_settings',
  HISTORY: 'spoty_history'
};

const DEFAULT_SETTINGS = {
  volume: 0.8,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'none', // 'none' | 'all' | 'one'
  eqPreset: 'flat',
  eqBands: [0, 0, 0, 0, 0], // 60Hz, 250Hz, 1kHz, 4kHz, 14kHz en dB
  lowSpecMode: 'auto'
};

export const Storage = {
  // Configuración general
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings) {
    try {
      const current = this.getSettings();
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...current, ...settings }));
    } catch (e) {
      console.warn('Error guardando configuración:', e);
    }
  },

  // Caché de pistas para carga instantánea
  getTracksCache() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRACKS_CACHE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveTracksCache(tracks) {
    try {
      const sanitized = memoryManager.sanitizeTracksForStorage(tracks);
      localStorage.setItem(STORAGE_KEYS.TRACKS_CACHE, JSON.stringify(sanitized));
    } catch (e) {
      console.warn('No se pudo guardar la caché de pistas en localStorage (posible límite de cuota):', e);
    }
  },

  // Carpetas guardadas
  getFolders() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FOLDERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addFolder(folderPath) {
    const folders = this.getFolders();
    if (!folders.includes(folderPath)) {
      folders.push(folderPath);
      localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
    }
    return folders;
  },

  // Favoritos
  getFavorites() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      return data ? new Set(JSON.parse(data)) : new Set();
    } catch {
      return new Set();
    }
  },

  toggleFavorite(trackId) {
    const favs = this.getFavorites();
    let isFav = false;
    if (favs.has(trackId)) {
      favs.delete(trackId);
      isFav = false;
    } else {
      favs.add(trackId);
      isFav = true;
    }
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(Array.from(favs)));
    } catch (e) {
      console.warn('Error guardando favoritos:', e);
    }
    return isFav;
  },

  isFavorite(trackId) {
    return this.getFavorites().has(trackId);
  },

  // Playlists
  getPlaylists() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  savePlaylist(playlist) {
    const playlists = this.getPlaylists();
    const idx = playlists.findIndex(p => p.id === playlist.id);
    if (idx >= 0) {
      playlists[idx] = playlist;
    } else {
      playlists.push(playlist);
    }
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    return playlists;
  },

  deletePlaylist(playlistId) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== playlistId);
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    return playlists;
  },

  addTrackToPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlist) {
      if (!playlist.trackIds) playlist.trackIds = [];
      if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        this.savePlaylist(playlist);
        return true;
      }
    }
    return false;
  },

  removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlist && playlist.trackIds) {
      playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
      this.savePlaylist(playlist);
      return true;
    }
    return false;
  },

  // Historial de reproducción reciente (Volver a escuchar)
  getHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addToHistory(track) {
    if (!track || !track.title) return;
    const history = this.getHistory().filter(t => t.id !== track.id);
    history.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      duration: track.duration || 0,
      cover: track.cover || null,
      path: track.path || '',
      isOnline: !!track.isOnline,
      isOffline: !!track.isOffline
    });
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 30)));
    } catch (e) {
      console.warn('Error guardando historial:', e);
    }
  }
};
