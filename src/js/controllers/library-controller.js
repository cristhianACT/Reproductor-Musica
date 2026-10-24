// Controlador de gestión de biblioteca, búsqueda, ordenación e importación de archivos
import { DOM } from '../ui/dom-elements.js';
import { Storage } from '../storage.js';
import { platform } from '../core/platform-bridge.js';
import { debounce } from '../utils/performance.js';
import { 
  renderHeroBanner, 
  renderTrackTable, 
  renderAlbumsGrid, 
  renderArtistsGrid 
} from '../ui/tracklist-view.js';
import { showToast } from '../ui/modals-view.js';

export class LibraryController {
  /**
   * @param {import('../core/state.js').AppState} state 
   * @param {import('../audio-engine.js').AudioEngine} audioEngine 
   */
  constructor(state, audioEngine) {
    this.state = state;
    this.audioEngine = audioEngine;

    this.init();
  }

  init() {
    this._initSearch();
    this._initSorting();
    this._initLibraryActions();
    this._initDragAndDrop();
    this._bindStateEvents();
  }

  _bindStateEvents() {
    this.state.on('tracks:updated', () => this.renderCurrentView());
    this.state.on('view:changed', () => this.renderCurrentView());
    this.state.on('search:changed', () => this.renderCurrentView());
    this.state.on('sort:changed', () => this.renderCurrentView());
    this.state.on('favorites:changed', () => this.renderCurrentView());
  }

  // Búsqueda en vivo con debounce para evitar cálculos innecesarios por pulsación
  _initSearch() {
    const searchBox = DOM.topbar.searchBox;
    const searchInput = DOM.topbar.searchInput;
    const clearBtn = DOM.topbar.clearSearchBtn;

    const debouncedSearch = debounce((query) => {
      this.state.setSearchQuery(query);
    }, 180);

    searchInput?.addEventListener('input', (e) => {
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

  // Ordenación de pistas
  _initSorting() {
    const sortBtn = DOM.topbar.sortBtn;
    const sortLabel = DOM.topbar.sortLabel;
    const modes = [
      { key: 'title', label: 'Título' },
      { key: 'artist', label: 'Artista' },
      { key: 'album', label: 'Álbum' },
      { key: 'duration', label: 'Duración' }
    ];

    sortBtn?.addEventListener('click', () => {
      const curIdx = modes.findIndex(m => m.key === this.state.sortMode);
      const nextIdx = (curIdx + 1) % modes.length;
      const nextMode = modes[nextIdx];
      this.state.setSortMode(nextMode.key);
      if (sortLabel) sortLabel.textContent = `Ordenar: ${nextMode.label}`;
      showToast(`Ordenado por: ${nextMode.label}`);
    });
  }

  // Acciones de importación y escaneo
  _initLibraryActions() {
    const addFolder = async () => {
      const { folderPath, tracks } = await platform.openFolder();
      if (tracks && tracks.length > 0) {
        this.state.mergeTracks(tracks);
        if (folderPath) Storage.addFolder(folderPath);
        showToast(`Se añadieron ${tracks.length} canciones`);
      }
    };

    const addFiles = async () => {
      showToast('Seleccionando archivos de música...');
      const tracks = await platform.openFiles();
      if (tracks && tracks.length > 0) {
        this.state.mergeTracks(tracks);
        showToast(`Se añadieron ${tracks.length} canciones`);
      }
    };

    const scanDefault = async () => {
      showToast(`Buscando música en el sistema...`);
      const { folderPath, tracks } = await platform.scanDefaultMusicDir();
      if (tracks && tracks.length > 0) {
        this.state.mergeTracks(tracks);
        if (folderPath) Storage.addFolder(folderPath);
        showToast(`Se encontraron ${tracks.length} canciones`);
      } else {
        showToast('No se encontraron canciones adicionales');
      }
    };

    DOM.sidebar.addFolderBtn?.addEventListener('click', addFolder);
    DOM.topbar.addFolderActionBtn?.addEventListener('click', addFolder);
    DOM.topbar.addFilesBtn?.addEventListener('click', addFiles);
    DOM.content.emptyAddFilesBtn?.addEventListener('click', addFiles);
    DOM.sidebar.scanDefaultMusicBtn?.addEventListener('click', scanDefault);
    DOM.content.emptyScanBtn?.addEventListener('click', scanDefault);

    document.getElementById('quickCardFav')?.addEventListener('click', () => this.state.setView('favorites'));
    document.getElementById('quickCardAlbums')?.addEventListener('click', () => this.state.setView('albums'));
    document.getElementById('quickCardArtists')?.addEventListener('click', () => this.state.setView('artists'));
    document.getElementById('quickCardFolder')?.addEventListener('click', addFolder);
  }

  // Comprobación de música inicial si la caché está vacía
  async checkInitialMusic() {
    let found = false;
    const { folderPath, tracks } = await platform.scanDefaultMusicDir();
    if (tracks && tracks.length > 0) {
      this.state.mergeTracks(tracks);
      if (folderPath) Storage.addFolder(folderPath);
      found = true;
    }

    if (!found) {
      const sampleTracks = await platform.getSampleMusic();
      if (sampleTracks && sampleTracks.length > 0) {
        this.state.mergeTracks(sampleTracks);
        showToast('Pistas de muestra cargadas en AURA');
      }
    }
  }

  // Drag and drop nativo y web
  _initDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      showToast(`Analizando archivos arrastrados...`);
      const tracks = await platform.parseDroppedFiles(files);
      if (tracks.length > 0) {
        this.state.mergeTracks(tracks);
        showToast(`Añadidas ${tracks.length} canciones`);
      }
    });
  }

  /**
   * Renderiza la vista activa (tabla, álbumes o artistas)
   */
  renderCurrentView() {
    const currentView = this.state.currentView;
    const table = DOM.content.trackTable;
    const grid = DOM.content.gridView;

    const quickGrid = document.getElementById('libraryQuickGrid');
    if (currentView === 'albums') {
      if (quickGrid) quickGrid.style.display = 'none';
      renderHeroBanner(currentView, this.state.allTracks);
      renderAlbumsGrid(
        this.state.allTracks,
        (albumName) => this.state.setView(`album:${albumName}`),
        (albumTracks) => this.audioEngine.setQueue(albumTracks, 0, true)
      );
      return;
    }

    if (currentView === 'artists') {
      if (quickGrid) quickGrid.style.display = 'none';
      renderHeroBanner(currentView, this.state.allTracks);
      renderArtistsGrid(
        this.state.allTracks,
        (artistName) => this.state.setView(`artist:${artistName}`),
        (artistTracks) => this.audioEngine.setQueue(artistTracks, 0, true)
      );
      return;
    }

    // Vista en tabla (library, favorites, album:<name>, artist:<name>, playlist:<id>)
    if (grid) grid.style.display = 'none';
    if (table) table.style.display = '';
    if (quickGrid) {
      quickGrid.style.display = (currentView === 'library' && !this.state.searchQuery) ? '' : 'none';
    }

    renderHeroBanner(currentView, this.state.allTracks);

    const filteredTracks = this.state.getFilteredAndSortedTracks();
    const currentTrack = this.audioEngine.getCurrentTrack();
    const isPlaying = this.audioEngine.isPlaying();

    renderTrackTable(filteredTracks, currentTrack, isPlaying, this.state.searchQuery, {
      onDoubleClick: (tracks, idx) => {
        this.audioEngine.setQueue(tracks, idx, true);
      },
      onPlayClick: (tracks, idx, trackId) => {
        const cur = this.audioEngine.getCurrentTrack();
        if (cur && cur.id === trackId) {
          this.audioEngine.togglePlay();
        } else {
          this.audioEngine.setQueue(tracks, idx, true);
        }
      },
      onFavoriteClick: (trackId) => {
        const isFav = Storage.toggleFavorite(trackId);
        showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
        this.state.emit('favorites:changed');
      },
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
