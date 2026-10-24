// Aura Music Player - Entry Point Principal (Máx. 120 líneas)
import { AudioEngine } from './audio-engine.js';
import { AudioVisualizer } from './visualizer.js';
import { Storage } from './storage.js';
import { state } from './core/state.js';
import { platform } from './core/platform-bridge.js';
import { perf } from './utils/performance.js';
import { DOM } from './ui/dom-elements.js';
import { updateWindowState, updateVolumeUI } from './ui/player-bar-view.js';
import { showToast } from './ui/modals-view.js';
import { PlayerController } from './controllers/player-controller.js';
import { LibraryController } from './controllers/library-controller.js';
import { PlaylistController } from './controllers/playlist-controller.js';

class App {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.state = state;
    this.playerController = new PlayerController(this.audioEngine, this.state);
    this.libraryController = new LibraryController(this.state, this.audioEngine);
    this.playlistController = new PlaylistController(this.state, this.audioEngine);
    this.init();
  }

  async init() {
    perf.init();
    if (platform.isMobile || platform.isCapacitor) {
      document.body.classList.add('is-mobile-platform');
    }
    this._initVisualizer();
    this._initWindowControls();
    this._initNavigation();
    this._initKeyboardShortcuts();

    const cached = Storage.getTracksCache();
    if (cached?.length > 0) {
      this.state.setAllTracks(cached);
    } else {
      this.state.setAllTracks([]);
      await this.libraryController.checkInitialMusic();
    }
  }

  _initVisualizer() {
    if (DOM.visualizer.canvas) {
      this.visualizer = new AudioVisualizer(DOM.visualizer.canvas, this.audioEngine);
      DOM.visualizer.btn?.addEventListener('click', () => {
        const active = this.visualizer.toggle();
        DOM.visualizer.btn?.classList.toggle('active', active);
        showToast(active ? 'Visualizador activado' : 'Visualizador desactivado');
      });
    }
  }

  _initWindowControls() {
    const lowSpecBtn = document.getElementById('lowSpecToggleBtn');
    lowSpecBtn?.classList.toggle('active', perf.isLowSpec);
    lowSpecBtn?.addEventListener('click', () => {
      const active = perf.toggleLowSpec();
      lowSpecBtn.classList.toggle('active', active);
      showToast(active ? 'Modo Bajo Consumo activado' : 'Modo Alto Rendimiento activado');
    });

    DOM.titlebar.minBtn?.addEventListener('click', () => platform.minimizeWindow());
    DOM.titlebar.maxBtn?.addEventListener('click', () => platform.maximizeWindow());
    DOM.titlebar.closeBtn?.addEventListener('click', () => platform.closeWindow());
    DOM.titlebar.miniPlayerBtn?.addEventListener('click', () => platform.toggleMiniPlayer());
    platform.onWindowStateChanged((ws) => updateWindowState(ws));
  }

  _initNavigation() {
    const navs = document.querySelectorAll('.sidebar-nav .nav-item, .mobile-bottom-nav .nav-item');
    navs.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view') || 'library';
        navs.forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === view));
        if (DOM.topbar.searchInput) DOM.topbar.searchInput.value = '';
        DOM.topbar.searchBox?.classList.remove('has-text');
        this.state.setView(view);
      });
    });
  }

  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // @ts-ignore
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const { code, ctrlKey } = e;
      if (code === 'Space') { e.preventDefault(); this.audioEngine.togglePlay(); }
      else if (code === 'ArrowRight' && !ctrlKey) { e.preventDefault(); this.audioEngine.seekTo(this.audioEngine.audio.currentTime + 5); }
      else if (code === 'ArrowLeft' && !ctrlKey) { e.preventDefault(); this.audioEngine.seekTo(this.audioEngine.audio.currentTime - 5); }
      else if (code === 'ArrowUp') { e.preventDefault(); const v = Math.min(1, this.audioEngine.getVolume() + 0.05); this.audioEngine.setVolume(v); updateVolumeUI(v); }
      else if (code === 'ArrowDown') { e.preventDefault(); const v = Math.max(0, this.audioEngine.getVolume() - 0.05); this.audioEngine.setVolume(v); updateVolumeUI(v); }
      else if (ctrlKey && code === 'ArrowRight') { e.preventDefault(); this.audioEngine.next(); }
      else if (ctrlKey && code === 'ArrowLeft') { e.preventDefault(); this.audioEngine.prev(); }
      else if (code === 'KeyS' && !ctrlKey) DOM.player.shuffleBtn?.click();
      else if (code === 'KeyR' && !ctrlKey) DOM.player.repeatBtn?.click();
      else if (code === 'KeyQ' && !ctrlKey) DOM.queue.openBtn?.click();
      else if (code === 'KeyV' && !ctrlKey) DOM.visualizer.btn?.click();
      else if (code === 'KeyE' && !ctrlKey) DOM.player.equalizerBtn?.click();
      else if (code === 'KeyM' && !ctrlKey) DOM.titlebar.miniPlayerBtn?.click();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new App());
