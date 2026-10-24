// @ts-check
// Controlador de gestión de biblioteca, Home Feed, búsqueda híbrida y descargas (<250 líneas)
import { DOM } from '../ui/dom-elements.js';
import { Storage } from '../storage.js';
import { platform } from '../core/platform-bridge.js';
import { debounce } from '../utils/performance.js';
import { renderHeroBanner, renderTrackTable, renderAlbumsGrid, renderArtistsGrid } from '../ui/tracklist-view.js';
import { renderHomeFeed } from '../ui/home-view.js';
import { renderCategorizedSearch } from '../ui/search-results-view.js';
import { showToast } from '../ui/modals-view.js';
import { streamingService } from '../services/streaming-service.js';
import { offlineManager } from '../services/offline-manager.js';

export class LibraryController {
  constructor(state, audioEngine) {
    this.state = state;
    this.audioEngine = audioEngine;
    this._cachedFeed = null;
    this._activeMood = 'Todo';
    this.init();
  }

  init() {
    this._initSearch(); this._initSorting(); this._initLibraryActions();
    this._initDragAndDrop(); this._bindStateEvents();
  }

  _bindStateEvents() {
    ['tracks:updated', 'view:changed', 'search:changed', 'sort:changed', 'favorites:changed'].forEach(ev => {
      this.state.on(ev, () => this.renderCurrentView());
    });
    offlineManager.addEventListener('download:completed', () => this.renderCurrentView());
  }

  _initSearch() {
    const { searchBox, searchInput, clearSearchBtn: clearBtn } = DOM.topbar;
    const debouncedSearch = debounce((query) => this.state.setSearchQuery(query), 350);
    searchInput?.addEventListener('input', (e) => {
      // @ts-ignore
      const q = e.target.value;
      searchBox?.classList.toggle('has-text', q.trim().length > 0);
      debouncedSearch(q);
    });
    clearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchBox?.classList.remove('has-text');
      this.state.setSearchQuery('');
      searchInput?.focus();
    });
  }

  _initSorting() {
    const { sortBtn, sortLabel } = DOM.topbar;
    const modes = [{ k: 'title', l: 'Título' }, { k: 'artist', l: 'Artista' }, { k: 'album', l: 'Álbum' }, { k: 'duration', l: 'Duración' }];
    sortBtn?.addEventListener('click', () => {
      const idx = modes.findIndex(m => m.k === this.state.sortMode);
      const next = modes[(idx + 1) % modes.length];
      this.state.setSortMode(next.k);
      if (sortLabel) sortLabel.textContent = `Ordenar: ${next.l}`;
      showToast(`Ordenado por: ${next.l}`);
    });
  }

  _initLibraryActions() {
    const addFolder = async () => {
      const { folderPath, tracks } = await platform.openFolder();
      if (tracks?.length) { this.state.mergeTracks(tracks); if (folderPath) Storage.addFolder(folderPath); showToast(`Se añadieron ${tracks.length} canciones`); }
    };
    const addFiles = async () => {
      showToast('Seleccionando archivos...');
      const tracks = await platform.openFiles();
      if (tracks?.length) { this.state.mergeTracks(tracks); showToast(`Se añadieron ${tracks.length} canciones`); }
    };
    const scanDefault = async () => {
      showToast(`Buscando música...`);
      const { folderPath, tracks } = await platform.scanDefaultMusicDir();
      if (tracks?.length) { this.state.mergeTracks(tracks); if (folderPath) Storage.addFolder(folderPath); showToast(`Se encontraron ${tracks.length} canciones`); }
      else showToast('No se encontraron canciones adicionales');
    };

    DOM.sidebar.addFolderBtn?.addEventListener('click', addFolder);
    DOM.topbar.addFolderActionBtn?.addEventListener('click', addFolder);
    DOM.topbar.addFilesBtn?.addEventListener('click', addFiles);
    DOM.content.emptyAddFilesBtn?.addEventListener('click', addFiles);
    DOM.sidebar.scanDefaultMusicBtn?.addEventListener('click', scanDefault);
    DOM.content.emptyScanBtn?.addEventListener('click', scanDefault);

    DOM.content.libraryTabsNav?.querySelectorAll('.library-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // @ts-ignore
        const tab = btn.dataset.tab;
        if (tab) this.state.setLibraryTab(tab);
      });
    });

    [['quickCardFav', 'favorites'], ['quickCardAlbums', 'albums'], ['quickCardArtists', 'artists']].forEach(([id, view]) => {
      document.getElementById(id)?.addEventListener('click', () => this.state.setView(view));
    });
    document.getElementById('quickCardFolder')?.addEventListener('click', addFolder);
  }

  async checkInitialMusic() {
    const { folderPath, tracks } = await platform.scanDefaultMusicDir();
    if (tracks?.length) { this.state.mergeTracks(tracks); if (folderPath) Storage.addFolder(folderPath); }
    else { const s = await platform.getSampleMusic(); if (s?.length) this.state.mergeTracks(s); }
  }

  _initDragAndDrop() {
    window.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      showToast(`Analizando archivos arrastrados...`);
      const tracks = await platform.parseDroppedFiles(files);
      if (tracks.length > 0) { this.state.mergeTracks(tracks); showToast(`Añadidas ${tracks.length} canciones`); }
    });
  }

  async _handleDownload(track) {
    if (offlineManager.isOffline(track.id)) return showToast(`"${track.title}" ya está descargada`);
    showToast(`Descargando "${track.title}"...`);
    track.isDownloading = true;
    this.renderCurrentView();
    try {
      await offlineManager.downloadTrackForOffline(track);
      showToast(`✓ Descargada offline: ${track.title}`);
    } catch (e) {
      showToast('Error al descargar canción');
    } finally {
      track.isDownloading = false;
      this.renderCurrentView();
    }
  }

  async _renderCategorizedSearch(query) {
    const { trackTable: table, gridView: grid, homeFeedView: hf, categorizedSearchView: cs, libraryTabsNav: lt, hero: h } = DOM.content;
    [table, grid, hf, lt, h].forEach(el => { if (el) el.style.display = 'none'; });
    if (cs) cs.style.display = 'block';

    const q = query.toLowerCase();
    const localMatches = this.state.allTracks.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.artist && t.artist.toLowerCase().includes(q)) || (t.album && t.album.toLowerCase().includes(q)));
    const onlineMatches = await streamingService.searchGlobalTracks(query);
    const topResult = onlineMatches[0] || localMatches[0] || null;

    renderCategorizedSearch(cs, { query, topResult, onlineTracks: onlineMatches, localTracks: localMatches }, {
      onPlay: (track) => this.audioEngine.setQueue([track], 0, true),
      onDownload: (track) => this._handleDownload(track),
      onFavorite: (id) => { const fav = Storage.toggleFavorite(id); showToast(fav ? 'Añadida a Favoritos' : 'Eliminada'); this.state.emit('favorites:changed'); }
    });
  }

  renderCurrentView() {
    const { trackTable: table, gridView: grid, homeFeedView: hf, categorizedSearchView: cs, libraryTabsNav: lt, hero: h } = DOM.content;
    const currentView = this.state.currentView;
    const quickGrid = document.getElementById('libraryQuickGrid');

    if (this.state.searchQuery) {
      if (quickGrid) quickGrid.style.display = 'none';
      return this._renderCategorizedSearch(this.state.searchQuery);
    }
    if (cs) cs.style.display = 'none';

    if (currentView === 'home') {
      [table, grid, lt, h, quickGrid].forEach(el => { if (el) el.style.display = 'none'; });
      if (hf) hf.style.display = 'block';

      if (!this._cachedFeed) {
        streamingService.getHomeFeed(this._activeMood).then(feed => {
          this._cachedFeed = feed;
          if (this.state.currentView === 'home' && !this.state.searchQuery) this.renderCurrentView();
        });
      }
      return renderHomeFeed(hf, this._cachedFeed || { mood: this._activeMood, quickPicks: [], trendingHits: [] }, {
        onPlay: (t) => this.audioEngine.setQueue([t], 0, true),
        onDownload: (t) => this._handleDownload(t),
        onMoodSelect: (m) => { this._activeMood = m; this._cachedFeed = null; this.renderCurrentView(); }
      });
    }

    if (hf) hf.style.display = 'none';
    if (h) h.style.display = '';

    if (currentView === 'library') {
      if (lt) {
        lt.style.display = 'flex';
        lt.querySelectorAll('.library-tab').forEach(b => {
          // @ts-ignore
          b.classList.toggle('active', b.dataset.tab === this.state.libraryTab);
        });
      }
    } else {
      if (lt) lt.style.display = 'none';
    }

    if (currentView === 'albums') {
      if (quickGrid) quickGrid.style.display = 'none';
      renderHeroBanner(currentView, this.state.allTracks);
      return renderAlbumsGrid(this.state.allTracks, (a) => this.state.setView(`album:${a}`), (t) => this.audioEngine.setQueue(t, 0, true));
    }
    if (currentView === 'artists') {
      if (quickGrid) quickGrid.style.display = 'none';
      renderHeroBanner(currentView, this.state.allTracks);
      return renderArtistsGrid(this.state.allTracks, (a) => this.state.setView(`artist:${a}`), (t) => this.audioEngine.setQueue(t, 0, true));
    }

    if (grid) grid.style.display = 'none';
    if (table) table.style.display = '';
    if (quickGrid) quickGrid.style.display = (currentView === 'library' && this.state.libraryTab === 'all' && !this.state.searchQuery) ? '' : 'none';

    renderHeroBanner(currentView, this.state.allTracks);

    const filteredTracks = this.state.getFilteredAndSortedTracks();
    const currentTrack = this.audioEngine.getCurrentTrack();
    const isPlaying = this.audioEngine.isPlaying();

    renderTrackTable(filteredTracks, currentTrack, isPlaying, this.state.searchQuery, {
      onDoubleClick: (tracks, idx) => this.audioEngine.setQueue(tracks, idx, true),
      onPlayClick: (tracks, idx, trackId) => {
        const cur = this.audioEngine.getCurrentTrack();
        if (cur && cur.id === trackId) this.audioEngine.togglePlay();
        else this.audioEngine.setQueue(tracks, idx, true);
      },
      onFavoriteClick: (trackId) => {
        const isFav = Storage.toggleFavorite(trackId);
        showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
        this.state.emit('favorites:changed');
      },
      onDownloadClick: (track) => this._handleDownload(track),
      onContextMenuTrigger: (trackId, event) => {
        const track = this.state.allTracks.find(t => t.id === trackId);
        if (track) {
          this.state.selectedTrackForMenu = track;
          this.state.emit('contextmenu:open', { track, x: event.clientX, y: event.clientY });
        }
      }
    });
  }
}
