import { AudioEngine, EQ_PRESETS } from './audio-engine.js';
import { Storage } from './storage.js';
import { AudioVisualizer } from './visualizer.js';

class App {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.visualizer = null;

    // Estado en memoria
    this.allTracks = [];
    this.displayedTracks = [];
    this.currentView = 'library'; // 'library' | 'favorites' | 'albums' | 'artists' | 'album:<name>' | 'artist:<name>' | 'playlist:<id>'
    this.searchQuery = '';
    this.sortMode = 'title'; // 'title' | 'artist' | 'album' | 'duration'
    this.isDraggingProgress = false;
    this.pendingSeekPercent = null;
    this.isDraggingVolume = false;

    // Menú contextual
    this.selectedTrackForMenu = null;

    this.init();
  }

  async init() {
    this._initVisualizer();
    this._initWindowControls();
    this._initNavigation();
    this._initSearch();
    this._initSorting();
    this._initPlayerControls();
    this._initLibraryActions();
    this._initEqualizer();
    this._initPlaylists();
    this._initQueueDrawer();
    this._initContextMenu();
    this._initDragAndDrop();
    this._initKeyboardShortcuts();
    this._initGlobalMediaKeys();

    // Cargar caché local
    const cachedTracks = Storage.getTracksCache();
    if (cachedTracks && cachedTracks.length > 0) {
      this.allTracks = cachedTracks;
      this.renderView();
    } else {
      this.renderView();
      this._checkInitialMusic();
    }

    this._bindAudioEvents();
  }

  // Visualizador
  _initVisualizer() {
    const canvas = document.getElementById('audioVisualizerCanvas');
    if (canvas) {
      this.visualizer = new AudioVisualizer(canvas, this.audioEngine);
      const visBtn = document.getElementById('visualizerBtn');
      visBtn.addEventListener('click', () => {
        const active = this.visualizer.toggle();
        visBtn.classList.toggle('active', active);
        this.showToast(active ? 'Visualizador activado' : 'Visualizador desactivado');
      });
    }
  }

  // Controles de ventana y Mini-Player
  _initWindowControls() {
    if (!window.electronAPI) return;

    document.getElementById('minBtn')?.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });

    const maxBtn = document.getElementById('maxBtn');
    maxBtn?.addEventListener('click', async () => {
      await window.electronAPI.maximizeWindow();
    });

    document.getElementById('closeBtn')?.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });

    // Botón Mini-Player
    const miniBtn = document.getElementById('miniPlayerBtn');
    miniBtn?.addEventListener('click', async () => {
      await window.electronAPI.toggleMiniPlayer();
    });

    window.electronAPI.onWindowStateChanged(({ isMaximized, isMini }) => {
      document.body.classList.toggle('mini-mode', !!isMini);

      const maxIcon = document.getElementById('maxIcon');
      if (maxIcon) {
        if (isMaximized) {
          maxIcon.innerHTML = `<rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke-width="2"/><path d="M9 4h7a2 2 0 0 1 2 2v7" fill="none" stroke-width="2"/>`;
        } else {
          maxIcon.innerHTML = `<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke-width="2"/>`;
        }
      }
    });
  }

  // Atajos multimedia globales de Windows
  _initGlobalMediaKeys() {
    if (!window.electronAPI || !window.electronAPI.onMediaKey) return;
    window.electronAPI.onMediaKey({
      toggle: () => this.audioEngine.togglePlay(),
      next: () => this.audioEngine.next(),
      prev: () => this.audioEngine.prev()
    });
  }

  // Navegación en sidebar
  _initNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });
  }

  switchView(viewId) {
    this.currentView = viewId;
    this.searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
      document.getElementById('searchBox')?.classList.remove('has-text');
    }
    this.renderView();
  }

  // Búsqueda
  _initSearch() {
    const searchBox = document.getElementById('searchBox');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');

    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      searchBox.classList.toggle('has-text', this.searchQuery.length > 0);
      this.renderTracks();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      this.searchQuery = '';
      searchBox.classList.remove('has-text');
      this.renderTracks();
      searchInput.focus();
    });
  }

  // Ordenación
  _initSorting() {
    const sortBtn = document.getElementById('sortBtn');
    const sortLabel = document.getElementById('sortLabel');
    const modes = [
      { key: 'title', label: 'Título' },
      { key: 'artist', label: 'Artista' },
      { key: 'album', label: 'Álbum' },
      { key: 'duration', label: 'Duración' }
    ];

    sortBtn?.addEventListener('click', () => {
      const curIdx = modes.findIndex(m => m.key === this.sortMode);
      const nextIdx = (curIdx + 1) % modes.length;
      this.sortMode = modes[nextIdx].key;
      sortLabel.textContent = `Ordenar: ${modes[nextIdx].label}`;
      this.renderTracks();
      this.showToast(`Ordenado por: ${modes[nextIdx].label}`);
    });
  }

  // Acciones de biblioteca
  _initLibraryActions() {
    const addFolder = async () => {
      if (!window.electronAPI) return;
      const folderPath = await window.electronAPI.openFolderDialog();
      if (folderPath) {
        this.showToast(`Escaneando: ${folderPath}...`);
        const tracks = await window.electronAPI.scanFolder(folderPath);
        this._mergeTracks(tracks);
        Storage.addFolder(folderPath);
        this.showToast(`Se añadieron ${tracks.length} canciones`);
      }
    };

    const addFiles = async () => {
      if (!window.electronAPI) return;
      const filePaths = await window.electronAPI.openFilesDialog();
      if (filePaths && filePaths.length > 0) {
        this.showToast(`Procesando ${filePaths.length} archivo(s)...`);
        const tracks = await window.electronAPI.parseFiles(filePaths);
        this._mergeTracks(tracks);
        this.showToast(`Se añadieron ${tracks.length} canciones`);
      }
    };

    document.getElementById('addFolderBtn')?.addEventListener('click', addFolder);
    document.getElementById('addFolderActionBtn')?.addEventListener('click', addFolder);
    document.getElementById('addFilesBtn')?.addEventListener('click', addFiles);
    document.getElementById('emptyAddFilesBtn')?.addEventListener('click', addFiles);

    const scanDefault = async () => {
      if (!window.electronAPI) return;
      const musicDir = await window.electronAPI.getDefaultMusicDir();
      if (musicDir) {
        this.showToast(`Escaneando carpeta Música de Windows...`);
        const tracks = await window.electronAPI.scanFolder(musicDir);
        this._mergeTracks(tracks);
        Storage.addFolder(musicDir);
        this.showToast(`Se encontraron ${tracks.length} canciones`);
      }
    };

    document.getElementById('scanDefaultMusicBtn')?.addEventListener('click', scanDefault);
    document.getElementById('emptyScanBtn')?.addEventListener('click', scanDefault);
  }

  async _checkInitialMusic() {
    if (!window.electronAPI) return;
    let found = false;
    const musicDir = await window.electronAPI.getDefaultMusicDir();
    if (musicDir) {
      const tracks = await window.electronAPI.scanFolder(musicDir);
      if (tracks && tracks.length > 0) {
        this._mergeTracks(tracks);
        Storage.addFolder(musicDir);
        found = true;
      }
    }
    if (!found) {
      const sampleTracks = await window.electronAPI.getSampleMusic();
      if (sampleTracks && sampleTracks.length > 0) {
        this._mergeTracks(sampleTracks);
        this.showToast('Pistas de muestra cargadas en AURA');
      }
    }
  }

  _mergeTracks(newTracks) {
    if (!newTracks || newTracks.length === 0) return;
    const existingMap = new Map(this.allTracks.map(t => [t.path, t]));

    for (const track of newTracks) {
      existingMap.set(track.path, track);
    }

    this.allTracks = Array.from(existingMap.values());
    Storage.saveTracksCache(this.allTracks);
    this.renderView();
  }

  // Drag & drop de archivos
  _initDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!window.electronAPI) return;
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const filePaths = Array.from(files).map(f => f.path);
      this.showToast(`Analizando archivos arrastrados...`);

      const tracks = await window.electronAPI.parseFiles(filePaths);
      if (tracks.length > 0) {
        this._mergeTracks(tracks);
        this.showToast(`Añadidas ${tracks.length} canciones`);
      }
    });
  }

  // Controles de reproducción y sliders
  _initPlayerControls() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    playPauseBtn.addEventListener('click', () => {
      this.audioEngine.togglePlay();
    });

    document.getElementById('prevBtn')?.addEventListener('click', () => this.audioEngine.prev());
    document.getElementById('nextBtn')?.addEventListener('click', () => this.audioEngine.next());

    // Shuffle
    const shuffleBtn = document.getElementById('shuffleBtn');
    shuffleBtn?.addEventListener('click', () => {
      const isShuffle = this.audioEngine.toggleShuffle();
      shuffleBtn.classList.toggle('active', isShuffle);
      this.showToast(isShuffle ? 'Modo aleatorio activado' : 'Modo aleatorio desactivado');
    });
    if (this.audioEngine.isShuffle) shuffleBtn?.classList.add('active');

    // Repeat
    const repeatBtn = document.getElementById('repeatBtn');
    repeatBtn?.addEventListener('click', () => {
      const mode = this.audioEngine.cycleRepeatMode();
      repeatBtn.classList.remove('active', 'repeat-one');
      if (mode === 'all') {
        repeatBtn.classList.add('active');
        this.showToast('Repetir todo');
      } else if (mode === 'one') {
        repeatBtn.classList.add('active', 'repeat-one');
        this.showToast('Repetir canción actual');
      } else {
        this.showToast('Repetición desactivada');
      }
    });

    // Scrubber
    const progContainer = document.getElementById('progressBarContainer');
    progContainer?.addEventListener('mousedown', (e) => {
      this.isDraggingProgress = true;
      const rect = progContainer.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.pendingSeekPercent = percent;
      this._updateProgressVisual(percent);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingProgress && progContainer) {
        const rect = progContainer.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.pendingSeekPercent = percent;
        this._updateProgressVisual(percent);
      }
      if (this.isDraggingVolume) {
        this._handleVolumeChange(e);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDraggingProgress) {
        this.isDraggingProgress = false;
        if (typeof this.pendingSeekPercent === 'number') {
          this._commitProgressSeek(this.pendingSeekPercent);
          this.pendingSeekPercent = null;
        }
      }
      this.isDraggingVolume = false;
    });

    // Control de volumen
    const volContainer = document.getElementById('volumeBarContainer');
    volContainer.addEventListener('mousedown', (e) => {
      this.isDraggingVolume = true;
      this._handleVolumeChange(e);
    });

    const volBtn = document.getElementById('volumeBtn');
    volBtn?.addEventListener('click', () => {
      const isMuted = this.audioEngine.toggleMute();
      this._updateVolumeUI(isMuted ? 0 : this.audioEngine.getVolume());
    });

    // Botones Hero
    document.getElementById('playAllBtn')?.addEventListener('click', () => {
      if (this.displayedTracks.length > 0) {
        this.audioEngine.setQueue(this.displayedTracks, 0, true);
      }
    });

    document.getElementById('shuffleAllBtn')?.addEventListener('click', () => {
      if (this.displayedTracks.length > 0) {
        if (!this.audioEngine.isShuffle) {
          this.audioEngine.toggleShuffle();
          shuffleBtn?.classList.add('active');
        }
        const randomIndex = Math.floor(Math.random() * this.displayedTracks.length);
        this.audioEngine.setQueue(this.displayedTracks, randomIndex, true);
      }
    });

    // Favorito en player bar
    const nowFavBtn = document.getElementById('nowPlayingFavBtn');
    nowFavBtn?.addEventListener('click', () => {
      const current = this.audioEngine.getCurrentTrack();
      if (current) {
        const isFav = Storage.toggleFavorite(current.id);
        nowFavBtn.classList.toggle('is-fav', isFav);
        this.showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
        this.renderTracks();
      }
    });

    // Click en carátula para abrir carpeta de la canción actual en Windows Explorer
    document.getElementById('nowPlayingArt')?.addEventListener('click', () => {
      const current = this.audioEngine.getCurrentTrack();
      if (current && window.electronAPI) {
        window.electronAPI.showItemInFolder(current.path);
      }
    });

    this._updateVolumeUI(this.audioEngine.isMuted() ? 0 : this.audioEngine.getVolume());
  }

  _updateProgressVisual(percent) {
    const fill = document.getElementById('progressBarFill');
    const thumb = document.getElementById('progressBarThumb');
    if (fill) fill.style.width = `${percent * 100}%`;
    if (thumb) thumb.style.left = `${percent * 100}%`;

    const dur = this.audioEngine.audio.duration;
    const currentTrack = this.audioEngine.getCurrentTrack();
    const realDur = (dur && isFinite(dur) && dur > 0) ? dur : (currentTrack?.duration || 0);

    const curLabel = document.getElementById('currentTimeLabel');
    if (curLabel && realDur > 0) {
      curLabel.textContent = this.formatTime(percent * realDur);
    }
  }

  _commitProgressSeek(percent) {
    const dur = this.audioEngine.audio.duration;
    const currentTrack = this.audioEngine.getCurrentTrack();
    const realDur = (dur && isFinite(dur) && dur > 0) ? dur : (currentTrack?.duration || 0);

    if (realDur > 0) {
      const targetTime = percent * realDur;
      this.audioEngine.seekTo(targetTime);
      const curLabel = document.getElementById('currentTimeLabel');
      if (curLabel) curLabel.textContent = this.formatTime(targetTime);
    }
  }

  _handleVolumeChange(e) {
    const container = document.getElementById('volumeBarContainer');
    const rect = container.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    this.audioEngine.setVolume(percent);
    this._updateVolumeUI(percent);
  }

  _updateVolumeUI(vol) {
    const fill = document.getElementById('volumeBarFill');
    const thumb = document.getElementById('volumeBarThumb');
    const volIcon = document.getElementById('volumeIcon');

    if (fill) fill.style.width = `${vol * 100}%`;
    if (thumb) thumb.style.left = `${vol * 100}%`;

    if (!volIcon) return;
    if (vol === 0) {
      volIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
    } else if (vol < 0.5) {
      volIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
    } else {
      volIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
    }
  }

  // Drawer de Cola de Reproducción
  _initQueueDrawer() {
    const queueBtn = document.getElementById('queueBtn');
    const drawer = document.getElementById('queueDrawer');
    const closeBtn = document.getElementById('closeQueueBtn');

    queueBtn?.addEventListener('click', () => {
      drawer.classList.toggle('open');
      queueBtn.classList.toggle('active', drawer.classList.contains('open'));
      this.renderQueueList();
    });

    closeBtn?.addEventListener('click', () => {
      drawer.classList.remove('open');
      queueBtn?.classList.remove('active');
    });
  }

  renderQueueList() {
    const list = document.getElementById('queueList');
    if (!list) return;

    const current = this.audioEngine.getCurrentTrack();
    const queue = this.audioEngine.queue;

    if (!queue || queue.length === 0) {
      list.innerHTML = `<div style="padding: 20px; font-size: 13px; color: var(--text-subdued); text-align: center;">No hay canciones en la cola</div>`;
      return;
    }

    list.innerHTML = queue.map((track, idx) => {
      const isCur = current && current.id === track.id;
      return `
        <div class="queue-item ${isCur ? 'active' : ''}" data-index="${idx}">
          <div style="font-size: 11px; color: var(--text-subdued); width: 20px; text-align: center;">
            ${isCur ? '▶' : idx + 1}
          </div>
          <div class="queue-item-info">
            <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
            <div class="queue-item-artist">${this.escapeHtml(track.artist)}</div>
          </div>
          <button class="icon-btn-subtle queue-remove-btn" data-index="${idx}" title="Quitar de la cola" style="opacity: 0.7;">
            <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-remove-btn')) return;
        const idx = parseInt(item.getAttribute('data-index'), 10);
        this.audioEngine.playTrackAtIndex(idx, true);
        this.renderQueueList();
      });
    });

    list.querySelectorAll('.queue-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.audioEngine.removeFromQueue(idx);
        this.renderQueueList();
        this.renderTracks();
      });
    });
  }

  // Menú contextual nativo de escritorio
  _initContextMenu() {
    const menu = document.getElementById('contextMenu');

    // Cerrar menú al hacer click fuera
    window.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    window.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.track-row') || e.target.closest('.grid-card');
      if (row) {
        e.preventDefault();
        const trackId = row.getAttribute('data-track-id');
        const track = this.allTracks.find(t => t.id === trackId);
        if (track) {
          this.selectedTrackForMenu = track;
          const isFav = Storage.isFavorite(track.id);
          document.getElementById('contextMenuFavLabel').textContent = isFav ? 'Quitar de Favoritos' : 'Marcar como Favorito';

          // Posicionar menú
          const x = Math.min(e.clientX, window.innerWidth - 240);
          const y = Math.min(e.clientY, window.innerHeight - 260);
          menu.style.left = `${x}px`;
          menu.style.top = `${y}px`;
          menu.style.display = 'flex';
        }
      } else {
        menu.style.display = 'none';
      }
    });

    // Manejar acciones del menú contextual
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        const action = item.getAttribute('data-action');
        const track = this.selectedTrackForMenu;
        if (!track) return;

        if (action === 'play-now') {
          this.audioEngine.setQueue([track, ...this.allTracks.filter(t => t.id !== track.id)], 0, true);
        } else if (action === 'add-queue') {
          this.audioEngine.addToQueueNext(track);
          this.renderQueueList();
          this.showToast(`"${track.title}" sonará a continuación`);
        } else if (action === 'add-to-playlist') {
          this._openAddToPlaylistModal(track);
        } else if (action === 'toggle-fav') {
          const isFav = Storage.toggleFavorite(track.id);
          this.showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
          this.renderTracks();
        } else if (action === 'show-in-folder') {
          if (window.electronAPI) {
            window.electronAPI.showItemInFolder(track.path);
          }
        } else if (action === 'copy-path') {
          navigator.clipboard.writeText(track.path);
          this.showToast('Ruta copiada al portapapeles');
        } else if (action === 'remove-library') {
          this.allTracks = this.allTracks.filter(t => t.id !== track.id);
          Storage.saveTracksCache(this.allTracks);
          this.renderView();
          this.showToast('Canción eliminada de la biblioteca');
        }
      });
    });
  }

  // Eventos del Audio Engine
  _bindAudioEvents() {
    this.audioEngine.onPlayStateChange = (isPlaying) => {
      const playIcon = document.getElementById('playPauseIcon');
      const btn = document.getElementById('playPauseBtn');
      if (isPlaying) {
        playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
        btn.classList.add('playing');
        btn.title = 'Pausar';
      } else {
        playIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
        btn.classList.remove('playing');
        btn.title = 'Reproducir';
      }
      this._updatePlayingRow();
    };

    this.audioEngine.onTrackChange = (track) => {
      this._updateNowPlayingBar(track);
      this._updatePlayingRow();
      this.renderQueueList();

      if (track && window.electronAPI) {
        window.electronAPI.notifyTrack({ title: track.title, artist: track.artist });
      }
    };

    this.audioEngine.onTimeUpdate = (currentTime, duration) => {
      if (!this.isDraggingProgress) {
        const fill = document.getElementById('progressBarFill');
        const thumb = document.getElementById('progressBarThumb');
        const curLabel = document.getElementById('currentTimeLabel');
        const totLabel = document.getElementById('totalTimeLabel');

        const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
        if (fill) fill.style.width = `${percent}%`;
        if (thumb) thumb.style.left = `${percent}%`;

        if (curLabel) curLabel.textContent = this.formatTime(currentTime);
        if (totLabel && duration > 0) totLabel.textContent = this.formatTime(duration);
      }
    };
  }

  _updateNowPlayingBar(track) {
    const art = document.getElementById('nowPlayingArt');
    const title = document.getElementById('nowPlayingTitle');
    const artist = document.getElementById('nowPlayingArtist');
    const favBtn = document.getElementById('nowPlayingFavBtn');
    const titlebarTitle = document.getElementById('titlebarTrackTitle');

    if (!track) {
      title.textContent = 'Ninguna canción';
      artist.textContent = 'Selecciona música para reproducir';
      art.innerHTML = `<div class="default-art"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
      favBtn?.classList.remove('is-fav');
      if (titlebarTitle) titlebarTitle.textContent = 'Aura Desktop Audio';
      return;
    }

    title.textContent = track.title || track.fileName;
    artist.textContent = track.artist || 'Artista desconocido';
    if (titlebarTitle) titlebarTitle.textContent = `${track.title} • ${track.artist}`;

    if (track.cover) {
      art.innerHTML = `<img src="${track.cover}" alt="Cover">`;
    } else {
      art.innerHTML = `<div class="default-art"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
    }

    const isFav = Storage.isFavorite(track.id);
    favBtn?.classList.toggle('is-fav', isFav);
  }

  _updatePlayingRow() {
    const current = this.audioEngine.getCurrentTrack();
    const isPlaying = this.audioEngine.isPlaying();
    const rows = document.querySelectorAll('.track-row');

    rows.forEach(row => {
      const trackId = row.getAttribute('data-track-id');
      const isThisTrack = current && current.id === trackId;

      row.classList.toggle('active', isThisTrack);
      row.classList.toggle('is-playing', isThisTrack && isPlaying);

      const playIcon = row.querySelector('.track-play-icon');
      if (playIcon) {
        if (isThisTrack && isPlaying) {
          playIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        } else {
          playIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        }
      }
    });
  }

  // Renderizado de vistas
  renderView() {
    const heroTitle = document.getElementById('heroTitle');
    const heroTag = document.getElementById('heroTag');
    const heroCover = document.getElementById('heroCover');
    const table = document.getElementById('trackTable');
    const grid = document.getElementById('gridView');

    let baseTracks = [];

    if (this.currentView === 'library') {
      heroTag.textContent = 'Colección';
      heroTitle.textContent = 'Tu Biblioteca';
      baseTracks = [...this.allTracks];
      heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
      table.style.display = 'table';
      grid.style.display = 'none';
    } else if (this.currentView === 'favorites') {
      heroTag.textContent = 'Lista';
      heroTitle.textContent = 'Tus Favoritos';
      const favs = Storage.getFavorites();
      baseTracks = this.allTracks.filter(t => favs.has(t.id));
      heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="var(--accent-cyan)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
      table.style.display = 'table';
      grid.style.display = 'none';
    } else if (this.currentView === 'albums') {
      heroTag.textContent = 'Explorar';
      heroTitle.textContent = 'Álbumes';
      heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
      this._renderAlbumsGrid();
      return;
    } else if (this.currentView === 'artists') {
      heroTag.textContent = 'Explorar';
      heroTitle.textContent = 'Artistas';
      heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
      this._renderArtistsGrid();
      return;
    } else if (this.currentView.startsWith('album:')) {
      const albumName = decodeURIComponent(this.currentView.replace('album:', ''));
      heroTag.textContent = 'Álbum';
      heroTitle.textContent = albumName;
      baseTracks = this.allTracks.filter(t => t.album === albumName);
      const firstCover = baseTracks.find(t => t.cover)?.cover;
      heroCover.innerHTML = firstCover ? `<img src="${firstCover}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
      table.style.display = 'table';
      grid.style.display = 'none';
    } else if (this.currentView.startsWith('artist:')) {
      const artistName = decodeURIComponent(this.currentView.replace('artist:', ''));
      heroTag.textContent = 'Artista';
      heroTitle.textContent = artistName;
      baseTracks = this.allTracks.filter(t => t.artist === artistName);
      heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
      table.style.display = 'table';
      grid.style.display = 'none';
    } else if (this.currentView.startsWith('playlist:')) {
      const pId = this.currentView.replace('playlist:', '');
      const playlist = Storage.getPlaylists().find(p => p.id === pId);
      if (playlist) {
        heroTag.textContent = 'Playlist';
        heroTitle.textContent = playlist.name;
        const trackIds = new Set(playlist.trackIds || []);
        baseTracks = this.allTracks.filter(t => trackIds.has(t.id));
        table.style.display = 'table';
        grid.style.display = 'none';
      }
    }

    this.displayedTracks = baseTracks;
    this.renderTracks();
    this.renderSidebarPlaylists();
  }

  // Renderizado en cuadrícula para Álbumes
  _renderAlbumsGrid() {
    const table = document.getElementById('trackTable');
    const grid = document.getElementById('gridView');
    const emptyState = document.getElementById('emptyState');
    table.style.display = 'none';

    // Agrupar pistas por álbum
    const albumsMap = new Map();
    for (const track of this.allTracks) {
      const alb = track.album || 'Álbum desconocido';
      if (!albumsMap.has(alb)) {
        albumsMap.set(alb, { name: alb, artist: track.artist, cover: track.cover, tracks: [] });
      }
      const item = albumsMap.get(alb);
      item.tracks.push(track);
      if (!item.cover && track.cover) item.cover = track.cover;
    }

    const albums = Array.from(albumsMap.values());
    if (albums.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = albums.map(a => `
      <div class="grid-card" data-album="${encodeURIComponent(a.name)}">
        <div class="grid-card-art">
          ${a.cover ? `<img src="${a.cover}" alt="Cover">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`}
        </div>
        <button class="grid-card-play-btn" data-play-album="${encodeURIComponent(a.name)}" title="Reproducir álbum">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="grid-card-info">
          <div class="grid-card-title">${this.escapeHtml(a.name)}</div>
          <div class="grid-card-subtitle">${this.escapeHtml(a.artist)} • ${a.tracks.length} canciones</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.grid-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.grid-card-play-btn')) return;
        const alb = card.getAttribute('data-album');
        this.switchView(`album:${alb}`);
      });
    });

    grid.querySelectorAll('.grid-card-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alb = decodeURIComponent(btn.getAttribute('data-play-album'));
        const albumObj = albumsMap.get(alb);
        if (albumObj && albumObj.tracks.length > 0) {
          this.audioEngine.setQueue(albumObj.tracks, 0, true);
        }
      });
    });
  }

  // Renderizado en cuadrícula para Artistas
  _renderArtistsGrid() {
    const table = document.getElementById('trackTable');
    const grid = document.getElementById('gridView');
    const emptyState = document.getElementById('emptyState');
    table.style.display = 'none';

    // Agrupar por artista
    const artistsMap = new Map();
    for (const track of this.allTracks) {
      const art = track.artist || 'Artista desconocido';
      if (!artistsMap.has(art)) {
        artistsMap.set(art, { name: art, cover: track.cover, tracks: [] });
      }
      const item = artistsMap.get(art);
      item.tracks.push(track);
      if (!item.cover && track.cover) item.cover = track.cover;
    }

    const artists = Array.from(artistsMap.values());
    if (artists.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = artists.map(a => `
      <div class="grid-card" data-artist="${encodeURIComponent(a.name)}" style="text-align: center; align-items: center;">
        <div class="grid-card-art artist-avatar" style="width: 140px; height: 140px;">
          ${a.cover ? `<img src="${a.cover}" alt="Avatar">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`}
        </div>
        <button class="grid-card-play-btn" data-play-artist="${encodeURIComponent(a.name)}" title="Reproducir artista">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="grid-card-info" style="align-items: center;">
          <div class="grid-card-title">${this.escapeHtml(a.name)}</div>
          <div class="grid-card-subtitle">${a.tracks.length} canciones</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.grid-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.grid-card-play-btn')) return;
        const art = card.getAttribute('data-artist');
        this.switchView(`artist:${art}`);
      });
    });

    grid.querySelectorAll('.grid-card-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const art = decodeURIComponent(btn.getAttribute('data-play-artist'));
        const artistObj = artistsMap.get(art);
        if (artistObj && artistObj.tracks.length > 0) {
          this.audioEngine.setQueue(artistObj.tracks, 0, true);
        }
      });
    });
  }

  // Renderizado de tabla de canciones
  renderTracks() {
    let list = [...this.displayedTracks];

    // Búsqueda en vivo
    if (this.searchQuery) {
      list = list.filter(t => {
        return (
          t.title.toLowerCase().includes(this.searchQuery) ||
          t.artist.toLowerCase().includes(this.searchQuery) ||
          t.album.toLowerCase().includes(this.searchQuery)
        );
      });
    }

    // Ordenación activa
    if (this.sortMode === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (this.sortMode === 'artist') {
      list.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (this.sortMode === 'album') {
      list.sort((a, b) => a.album.localeCompare(b.album));
    } else if (this.sortMode === 'duration') {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }

    const tbody = document.getElementById('trackListBody');
    const table = document.getElementById('trackTable');
    const emptyState = document.getElementById('emptyState');
    const countLabel = document.getElementById('heroTrackCount');
    const durLabel = document.getElementById('heroDuration');

    countLabel.textContent = `${list.length} canciones`;
    const totalSecs = list.reduce((acc, t) => acc + (t.duration || 0), 0);
    const mins = Math.floor(totalSecs / 60);
    durLabel.textContent = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

    if (list.length === 0) {
      tbody.innerHTML = '';
      table.style.display = 'none';
      emptyState.style.display = 'flex';
      if (this.searchQuery) {
        document.getElementById('emptyStateTitle').textContent = `No se encontraron resultados para "${this.searchQuery}"`;
      } else {
        document.getElementById('emptyStateTitle').textContent = 'Tu biblioteca está esperando tu música';
      }
      return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    const current = this.audioEngine.getCurrentTrack();
    const isPlaying = this.audioEngine.isPlaying();
    const favs = Storage.getFavorites();

    tbody.innerHTML = list.map((track, idx) => {
      const isThisTrack = current && current.id === track.id;
      const isFav = favs.has(track.id);

      const coverHtml = track.cover 
        ? `<img src="${track.cover}" alt="Cover">`
        : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

      return `
        <tr class="track-row ${isThisTrack ? 'active' : ''} ${isThisTrack && isPlaying ? 'is-playing' : ''}" data-track-id="${track.id}" data-index="${idx}">
          <td class="col-num-cell">
            <span class="track-index">${idx + 1}</span>
            <span class="track-play-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                ${isThisTrack && isPlaying ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21 5 3"/>'}
              </svg>
            </span>
            <div class="equalizer-indicator">
              <span class="equalizer-bar"></span>
              <span class="equalizer-bar"></span>
              <span class="equalizer-bar"></span>
              <span class="equalizer-bar"></span>
            </div>
          </td>
          <td>
            <div class="track-main-cell">
              <div class="track-thumb">${coverHtml}</div>
              <div class="track-meta-wrap">
                <span class="track-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</span>
                <span class="track-artist" title="${this.escapeHtml(track.artist)}">${this.escapeHtml(track.artist)}</span>
              </div>
            </div>
          </td>
          <td class="track-album" title="${this.escapeHtml(track.album)}">${this.escapeHtml(track.album)}</td>
          <td class="track-duration">${this.formatTime(track.duration)}</td>
          <td class="track-actions-cell">
            <button class="heart-btn ${isFav ? 'is-fav' : ''}" data-action="favorite" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
            <button class="more-btn" data-action="context-trigger" title="Más opciones">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Eventos de fila
    const rows = tbody.querySelectorAll('.track-row');
    rows.forEach(row => {
      const idx = parseInt(row.getAttribute('data-index'), 10);
      const trackId = row.getAttribute('data-track-id');

      row.addEventListener('dblclick', () => {
        this.audioEngine.setQueue(list, idx, true);
      });

      row.querySelector('.track-play-icon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentTrack = this.audioEngine.getCurrentTrack();
        if (currentTrack && currentTrack.id === trackId) {
          this.audioEngine.togglePlay();
        } else {
          this.audioEngine.setQueue(list, idx, true);
        }
      });

      row.querySelector('[data-action="favorite"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isFav = Storage.toggleFavorite(trackId);
        this.showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
        this.renderTracks();
      });

      row.querySelector('[data-action="context-trigger"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = this.allTracks.find(t => t.id === trackId);
        if (track) {
          this.selectedTrackForMenu = track;
          const menu = document.getElementById('contextMenu');
          const isFav = Storage.isFavorite(track.id);
          document.getElementById('contextMenuFavLabel').textContent = isFav ? 'Quitar de Favoritos' : 'Marcar como Favorito';

          menu.style.left = `${Math.min(e.clientX, window.innerWidth - 240)}px`;
          menu.style.top = `${Math.min(e.clientY, window.innerHeight - 260)}px`;
          menu.style.display = 'flex';
        }
      });
    });
  }

  renderSidebarPlaylists() {
    const listContainer = document.getElementById('playlistList');
    if (!listContainer) return;

    const playlists = Storage.getPlaylists();
    if (playlists.length === 0) {
      listContainer.innerHTML = `<div style="padding: 10px; font-size: 12px; color: var(--text-subdued); text-align: center;">Crea tu primera lista con el botón +</div>`;
      return;
    }

    listContainer.innerHTML = playlists.map(p => {
      const isActive = this.currentView === `playlist:${p.id}`;
      return `
        <div class="playlist-item ${isActive ? 'active' : ''}" data-playlist-id="${p.id}">
          <div class="playlist-thumb">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </div>
          <div class="playlist-info">
            <span class="playlist-name">${this.escapeHtml(p.name)}</span>
            <span class="playlist-meta">${(p.trackIds || []).length} canciones</span>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
        const pId = item.getAttribute('data-playlist-id');
        this.switchView(`playlist:${pId}`);
      });
    });
  }

  // Playlists
  _initPlaylists() {
    const modal = document.getElementById('playlistModal');
    const openBtn = document.getElementById('addPlaylistBtn');
    const closeBtn = document.getElementById('closePlaylistModalBtn');
    const cancelBtn = document.getElementById('cancelPlaylistBtn');
    const saveBtn = document.getElementById('savePlaylistBtn');
    const nameInput = document.getElementById('playlistNameInput');

    openBtn?.addEventListener('click', () => {
      nameInput.value = '';
      modal.classList.add('active');
      nameInput.focus();
    });

    const closeModal = () => modal.classList.remove('active');
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    saveBtn?.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const newPlaylist = {
        id: 'pl_' + Date.now(),
        name,
        trackIds: []
      };
      Storage.savePlaylist(newPlaylist);
      closeModal();
      this.renderSidebarPlaylists();
      this.showToast(`Playlist "${name}" creada`);
    });

    // Modal Añadir a playlist
    const addModal = document.getElementById('addToPlaylistModal');
    document.getElementById('closeAddToPlaylistBtn')?.addEventListener('click', () => {
      addModal.classList.remove('active');
    });
  }

  _openAddToPlaylistModal(track) {
    const modal = document.getElementById('addToPlaylistModal');
    const container = document.getElementById('targetPlaylistsList');
    const playlists = Storage.getPlaylists();

    if (playlists.length === 0) {
      container.innerHTML = `<div style="padding: 14px; text-align: center; color: var(--text-subdued); font-size: 13px;">No tienes playlists creadas todavía. Crea una desde la barra lateral.</div>`;
    } else {
      container.innerHTML = playlists.map(p => `
        <button class="pill-btn" data-playlist-id="${p.id}" style="justify-content: space-between; width: 100%;">
          <span>${this.escapeHtml(p.name)}</span>
          <span style="font-size: 11px; color: var(--text-subdued);">${(p.trackIds || []).length} pistas</span>
        </button>
      `).join('');

      container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const pId = btn.getAttribute('data-playlist-id');
          Storage.addTrackToPlaylist(pId, track.id);
          modal.classList.remove('active');
          this.renderSidebarPlaylists();
          this.showToast(`Añadida a la playlist`);
        });
      });
    }

    modal.classList.add('active');
  }

  // Ecualizador
  _initEqualizer() {
    const modal = document.getElementById('eqModal');
    const openBtn = document.getElementById('equalizerBtn');
    const closeBtn = document.getElementById('closeEqBtn');
    const presetsContainer = document.getElementById('eqPresetsContainer');
    const sliders = document.querySelectorAll('.eq-slider');

    openBtn?.addEventListener('click', () => modal.classList.add('active'));
    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));

    const settings = Storage.getSettings();
    presetsContainer.innerHTML = Object.entries(EQ_PRESETS).map(([key, p]) => {
      const isActive = settings.eqPreset === key;
      return `<button class="preset-chip ${isActive ? 'active' : ''}" data-preset="${key}">${p.name}</button>`;
    }).join('');

    presetsContainer.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        presetsContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const key = chip.getAttribute('data-preset');
        this.audioEngine.applyPreset(key);
        this._updateEqSlidersFromEngine();
        this.showToast(`Preset EQ: ${EQ_PRESETS[key].name}`);
      });
    });

    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = parseInt(e.target.getAttribute('data-band'), 10);
        const val = parseFloat(e.target.value);
        document.getElementById(`eqVal${band}`).textContent = `${val > 0 ? '+' : ''}${val} dB`;
        this.audioEngine.setBandGain(band, val);
        presetsContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      });
    });

    this._updateEqSlidersFromEngine();
  }

  _updateEqSlidersFromEngine() {
    const settings = Storage.getSettings();
    const bands = settings.eqBands || [0, 0, 0, 0, 0];
    bands.forEach((val, idx) => {
      const slider = document.querySelector(`.eq-slider[data-band="${idx}"]`);
      if (slider) slider.value = val;
      const label = document.getElementById(`eqVal${idx}`);
      if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;
    });
  }

  // Atajos de teclado
  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.audioEngine.togglePlay();
      } else if (e.code === 'ArrowRight' && !e.ctrlKey) {
        e.preventDefault();
        this.audioEngine.seekTo(this.audioEngine.audio.currentTime + 5);
      } else if (e.code === 'ArrowLeft' && !e.ctrlKey) {
        e.preventDefault();
        this.audioEngine.seekTo(this.audioEngine.audio.currentTime - 5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(1, this.audioEngine.getVolume() + 0.05);
        this.audioEngine.setVolume(newVol);
        this._updateVolumeUI(newVol);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, this.audioEngine.getVolume() - 0.05);
        this.audioEngine.setVolume(newVol);
        this._updateVolumeUI(newVol);
      } else if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault();
        this.audioEngine.next();
      } else if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        this.audioEngine.prev();
      } else if (e.code === 'KeyS' && !e.ctrlKey) {
        document.getElementById('shuffleBtn')?.click();
      } else if (e.code === 'KeyR' && !e.ctrlKey) {
        document.getElementById('repeatBtn')?.click();
      } else if (e.code === 'KeyQ' && !e.ctrlKey) {
        document.getElementById('queueBtn')?.click();
      } else if (e.code === 'KeyV' && !e.ctrlKey) {
        document.getElementById('visualizerBtn')?.click();
      } else if (e.code === 'KeyE' && !e.ctrlKey) {
        document.getElementById('equalizerBtn')?.click();
      } else if (e.code === 'KeyM' && !e.ctrlKey) {
        document.getElementById('miniPlayerBtn')?.click();
      }
    });
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Arrancar aplicación
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
