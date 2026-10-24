// Centralización de selectores y elementos del DOM para Aura Music Player

export const DOM = {
  // Glow ambiental
  get auraGlow() { return document.getElementById('auraGlow'); },

  // Barra de título frameless
  titlebar: {
    get trackTitle() { return document.getElementById('titlebarTrackTitle'); },
    get miniPlayerBtn() { return document.getElementById('miniPlayerBtn'); },
    get minBtn() { return document.getElementById('minBtn'); },
    get maxBtn() { return document.getElementById('maxBtn'); },
    get maxIcon() { return document.getElementById('maxIcon'); },
    get closeBtn() { return document.getElementById('closeBtn'); }
  },

  // Barra lateral (Sidebar)
  sidebar: {
    get navItems() { return document.querySelectorAll('.sidebar-nav .nav-item'); },
    get addPlaylistBtn() { return document.getElementById('addPlaylistBtn'); },
    get addFolderBtn() { return document.getElementById('addFolderBtn'); },
    get playlistList() { return document.getElementById('playlistList'); },
    get scanDefaultMusicBtn() { return document.getElementById('scanDefaultMusicBtn'); }
  },

  // Barra superior de contenido (Topbar)
  topbar: {
    get searchBox() { return document.getElementById('searchBox'); },
    get searchInput() { return /** @type {HTMLInputElement | null} */ (document.getElementById('searchInput')); },
    get clearSearchBtn() { return document.getElementById('clearSearchBtn'); },
    get searchModePills() { return document.getElementById('searchModePills'); },
    get pillSearchLocal() { return document.getElementById('pillSearchLocal'); },
    get pillSearchOnline() { return document.getElementById('pillSearchOnline'); },
    get sortBtn() { return document.getElementById('sortBtn'); },
    get sortLabel() { return document.getElementById('sortLabel'); },
    get addFilesBtn() { return document.getElementById('addFilesBtn'); },
    get addFolderActionBtn() { return document.getElementById('addFolderActionBtn'); }
  },

  // Área de contenido principal
  content: {
    get scrollArea() { return document.getElementById('contentScrollArea'); },
    get heroBanner() { return document.getElementById('heroBanner'); },
    get heroCover() { return document.getElementById('heroCover'); },
    get heroTag() { return document.getElementById('heroTag'); },
    get heroTitle() { return document.getElementById('heroTitle'); },
    get heroMeta() { return document.getElementById('heroMeta'); },
    get heroTrackCount() { return document.getElementById('heroTrackCount'); },
    get heroDuration() { return document.getElementById('heroDuration'); },
    get playAllBtn() { return document.getElementById('playAllBtn'); },
    get shuffleAllBtn() { return document.getElementById('shuffleAllBtn'); },
    get homeFeedView() { return document.getElementById('homeFeedView'); },
    get categorizedSearchView() { return document.getElementById('categorizedSearchView'); },
    get libraryTabsNav() { return document.getElementById('libraryTabsNav'); },
    get trackTable() { return document.getElementById('trackTable'); },
    get trackListBody() { return document.getElementById('trackListBody'); },
    get gridView() { return document.getElementById('gridView'); },
    get emptyState() { return document.getElementById('emptyState'); },
    get emptyStateTitle() { return document.getElementById('emptyStateTitle'); },
    get emptyScanBtn() { return document.getElementById('emptyScanBtn'); },
    get emptyAddFilesBtn() { return document.getElementById('emptyAddFilesBtn'); }
  },

  // Drawer de cola de reproducción
  queue: {
    get drawer() { return document.getElementById('queueDrawer'); },
    get openBtn() { return document.getElementById('queueBtn'); },
    get closeBtn() { return document.getElementById('closeQueueBtn'); },
    get list() { return document.getElementById('queueList'); }
  },

  // Visualizador
  visualizer: {
    get canvas() { return document.getElementById('audioVisualizerCanvas'); },
    get overlay() { return document.getElementById('visualizerOverlay'); },
    get btn() { return document.getElementById('visualizerBtn'); }
  },

  // Barra de reproducción inferior (Player Bar)
  player: {
    get bar() { return document.getElementById('playerBar'); },
    get nowPlayingArt() { return document.getElementById('nowPlayingArt'); },
    get nowPlayingTitle() { return document.getElementById('nowPlayingTitle'); },
    get nowPlayingArtist() { return document.getElementById('nowPlayingArtist'); },
    get playerDownloadBtn() { return document.getElementById('playerDownloadBtn'); },
    get nowPlayingFavBtn() { return document.getElementById('nowPlayingFavBtn'); },
    get lyricsBtn() { return document.getElementById('lyricsBtn'); },
    get shuffleBtn() { return document.getElementById('shuffleBtn'); },
    get prevBtn() { return document.getElementById('prevBtn'); },
    get playPauseBtn() { return document.getElementById('playPauseBtn'); },
    get playPauseIcon() { return document.getElementById('playPauseIcon'); },
    get nextBtn() { return document.getElementById('nextBtn'); },
    get repeatBtn() { return document.getElementById('repeatBtn'); },
    get currentTimeLabel() { return document.getElementById('currentTimeLabel'); },
    get totalTimeLabel() { return document.getElementById('totalTimeLabel'); },
    get progressBarContainer() { return document.getElementById('progressBarContainer'); },
    get progressBarFill() { return document.getElementById('progressBarFill'); },
    get progressBarThumb() { return document.getElementById('progressBarThumb'); },
    get equalizerBtn() { return document.getElementById('equalizerBtn'); },
    get volumeBtn() { return document.getElementById('volumeBtn'); },
    get volumeIcon() { return document.getElementById('volumeIcon'); },
    get volumeBarContainer() { return document.getElementById('volumeBarContainer'); },
    get volumeBarFill() { return document.getElementById('volumeBarFill'); },
    get volumeBarThumb() { return document.getElementById('volumeBarThumb'); }
  },

  // Menú contextual
  contextMenu: {
    get menu() { return document.getElementById('contextMenu'); },
    get favLabel() { return document.getElementById('contextMenuFavLabel'); },
    get items() { return document.querySelectorAll('#contextMenu .context-menu-item'); }
  },

  // Modales
  modals: {
    eq: {
      get overlay() { return document.getElementById('eqModal'); },
      get closeBtn() { return document.getElementById('closeEqBtn'); },
      get presetsContainer() { return document.getElementById('eqPresetsContainer'); },
      get sliders() { return document.querySelectorAll('.eq-slider'); }
    },
    playlist: {
      get overlay() { return document.getElementById('playlistModal'); },
      get closeBtn() { return document.getElementById('closePlaylistModalBtn'); },
      get cancelBtn() { return document.getElementById('cancelPlaylistBtn'); },
      get saveBtn() { return document.getElementById('savePlaylistBtn'); },
      get nameInput() { return document.getElementById('playlistNameInput'); }
    },
    addToPlaylist: {
      get overlay() { return document.getElementById('addToPlaylistModal'); },
      get closeBtn() { return document.getElementById('closeAddToPlaylistBtn'); },
      get list() { return document.getElementById('targetPlaylistsList'); }
    }
  },

  // Vista Móvil Expandida (Full-Screen Now Playing)
  mobileSheet: {
    get sheet() { return document.getElementById('mobileNowPlayingSheet'); },
    get closeBtn() { return document.getElementById('closeSheetBtn'); },
    get art() { return document.getElementById('sheetArt'); },
    get title() { return document.getElementById('sheetTitle'); },
    get artist() { return document.getElementById('sheetArtist'); },
    get favBtn() { return document.getElementById('sheetFavBtn'); },
    get playPauseBtn() { return document.getElementById('sheetPlayPauseBtn'); },
    get playPauseIcon() { return document.getElementById('sheetPlayPauseIcon'); },
    get prevBtn() { return document.getElementById('sheetPrevBtn'); },
    get nextBtn() { return document.getElementById('sheetNextBtn'); },
    get shuffleBtn() { return document.getElementById('sheetShuffleBtn'); },
    get repeatBtn() { return document.getElementById('sheetRepeatBtn'); },
    get progressBarFill() { return document.getElementById('sheetProgressBarFill'); },
    get currentTimeLabel() { return document.getElementById('sheetCurrentTimeLabel'); },
    get totalTimeLabel() { return document.getElementById('sheetTotalTimeLabel'); }
  },

  // Notificación Toast
  get toast() { return document.getElementById('toast'); }
};
