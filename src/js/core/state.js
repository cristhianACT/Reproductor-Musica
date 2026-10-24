// Centralización del Estado Global de Aura Music Player con patrón Pub/Sub
import { Storage } from '../storage.js';
import { offlineManager } from '../services/offline-manager.js';

class AppState extends EventTarget {
  constructor() {
    super();

    // Estado interno
    this._allTracks = [];
    this._onlineTracks = [];
    this._displayedTracks = [];
    this._currentView = 'home'; // 'home' | 'explore' | 'library' | 'offline' | 'favorites' | 'albums' | 'artists'
    this._libraryTab = 'all'; // 'all' | 'favorites' | 'playlists' | 'local'
    this._searchQuery = '';
    this._searchMode = 'local'; // 'local' | 'online'
    this._sortMode = 'title'; // 'title' | 'artist' | 'album' | 'duration'
    this._isNetworkOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

    // Estados de interacción
    this.isDraggingProgress = false;
    this.pendingSeekPercent = null;
    this.isDraggingVolume = false;

    // Track seleccionado para menú contextual
    this.selectedTrackForMenu = null;
  }

  // Métodos Pub/Sub simplificados
  on(event, callback) {
    this.addEventListener(event, (e) => callback(e.detail));
  }

  off(event, callback) {
    this.removeEventListener(event, callback);
  }

  emit(event, detail = null) {
    this.dispatchEvent(new CustomEvent(event, { detail }));
  }

  // Getters
  get allTracks() {
    return this._allTracks;
  }

  get onlineTracks() {
    return this._onlineTracks;
  }

  get searchMode() {
    return this._searchMode;
  }

  get isNetworkOffline() {
    return this._isNetworkOffline;
  }

  get displayedTracks() {
    return this._displayedTracks;
  }

  get currentView() {
    return this._currentView;
  }

  get searchQuery() {
    return this._searchQuery;
  }

  get sortMode() {
    return this._sortMode;
  }

  get libraryTab() {
    return this._libraryTab;
  }

  setLibraryTab(tab) {
    this._libraryTab = tab;
    this.updateDisplayedTracks();
    this.emit('librarytab:changed', this._libraryTab);
  }

  // Setters y actualizadores con notificación
  setAllTracks(tracks) {
    this._allTracks = Array.isArray(tracks) ? tracks : [];
    this.updateDisplayedTracks();
    this.emit('tracks:updated', this._allTracks);
  }

  mergeTracks(newTracks) {
    if (!newTracks || newTracks.length === 0) return;
    const existingMap = new Map(this._allTracks.map(t => [t.path, t]));
    for (const track of newTracks) {
      existingMap.set(track.path, track);
    }
    this._allTracks = Array.from(existingMap.values());
    Storage.saveTracksCache(this._allTracks);
    this.updateDisplayedTracks();
    this.emit('tracks:updated', this._allTracks);
  }

  removeTrackFromLibrary(trackId) {
    this._allTracks = this._allTracks.filter(t => t.id !== trackId);
    Storage.saveTracksCache(this._allTracks);
    this.updateDisplayedTracks();
    this.emit('tracks:updated', this._allTracks);
  }

  setView(viewId) {
    this._currentView = viewId;
    this._searchQuery = '';
    this.updateDisplayedTracks();
    this.emit('view:changed', { view: this._currentView, displayedTracks: this._displayedTracks });
  }

  setSearchQuery(query) {
    this._searchQuery = (query || '').trim().toLowerCase();
    this.emit('search:changed', this._searchQuery);
  }

  setSortMode(mode) {
    this._sortMode = mode;
    this.emit('sort:changed', this._sortMode);
  }

  setOnlineTracks(tracks) {
    this._onlineTracks = Array.isArray(tracks) ? tracks : [];
    if (this._currentView === 'explore' || this._searchMode === 'online') {
      this.updateDisplayedTracks();
    }
    this.emit('tracks:updated', this._displayedTracks);
  }

  setSearchMode(mode) {
    this._searchMode = mode;
    this.emit('searchmode:changed', this._searchMode);
  }

  setNetworkOffline(isOffline) {
    this._isNetworkOffline = !!isOffline;
    this.emit('network:changed', { isOffline: this._isNetworkOffline });
  }

  /**
   * Recalcula la lista de pistas a desplegar según la vista activa
   */
  updateDisplayedTracks() {
    let baseTracks = [];

    if (this._currentView === 'home') {
      baseTracks = [];
    } else if (this._currentView === 'library') {
      if (this._libraryTab === 'favorites') {
        const favs = Storage.getFavorites();
        baseTracks = this._allTracks.filter(t => favs.has(t.id));
      } else if (this._libraryTab === 'local') {
        baseTracks = this._allTracks.filter(t => !t.isOnline);
      } else {
        baseTracks = [...this._allTracks];
      }
    } else if (this._currentView === 'explore') {
      baseTracks = [...this._onlineTracks];
    } else if (this._currentView === 'offline') {
      baseTracks = offlineManager.getAllOfflineTracks();
    } else if (this._currentView === 'favorites') {
      const favs = Storage.getFavorites();
      baseTracks = this._allTracks.filter(t => favs.has(t.id));
    } else if (this._currentView.startsWith('album:')) {
      const albumName = decodeURIComponent(this._currentView.replace('album:', ''));
      baseTracks = this._allTracks.filter(t => t.album === albumName);
    } else if (this._currentView.startsWith('artist:')) {
      const artistName = decodeURIComponent(this._currentView.replace('artist:', ''));
      baseTracks = this._allTracks.filter(t => t.artist === artistName);
    } else if (this._currentView.startsWith('playlist:')) {
      const pId = this._currentView.replace('playlist:', '');
      const playlist = Storage.getPlaylists().find(p => p.id === pId);
      if (playlist) {
        const trackIds = new Set(playlist.trackIds || []);
        baseTracks = this._allTracks.filter(t => trackIds.has(t.id));
      }
    } else {
      baseTracks = [...this._allTracks];
    }

    this._displayedTracks = baseTracks;
    return this._displayedTracks;
  }

  /**
   * Obtiene la lista actual filtrada por búsqueda y ordenada por sortMode
   */
  getFilteredAndSortedTracks() {
    let list = [...this._displayedTracks];

    // Búsqueda en vivo
    if (this._searchQuery) {
      list = list.filter(t => {
        return (
          (t.title && t.title.toLowerCase().includes(this._searchQuery)) ||
          (t.artist && t.artist.toLowerCase().includes(this._searchQuery)) ||
          (t.album && t.album.toLowerCase().includes(this._searchQuery))
        );
      });
    }

    // Ordenación activa
    if (this._sortMode === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (this._sortMode === 'artist') {
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (this._sortMode === 'album') {
      list.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
    } else if (this._sortMode === 'duration') {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }

    return list;
  }
}

export const state = new AppState();
