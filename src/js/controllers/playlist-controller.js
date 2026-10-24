// Controlador de playlists, cola de reproducción y menú contextual
import { DOM } from '../ui/dom-elements.js';
import { Storage } from '../storage.js';
import { platform } from '../core/platform-bridge.js';
import { escapeHtml } from '../utils/formatters.js';
import { renderSidebarPlaylists, renderQueueList, showToast } from '../ui/modals-view.js';

export class PlaylistController {
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
    this._initPlaylistsModal();
    this._initQueueDrawer();
    this._initContextMenu();
    this._bindEvents();

    this.renderSidebar();
  }

  _bindEvents() {
    // Sincronizar cola al cambiar de pista
    this.state.on('playback:track', () => {
      this.renderQueue();
    });

    // Sincronizar playlists al cambiar de vista o tracks
    this.state.on('view:changed', () => {
      this.renderSidebar();
    });

    // Abrir menú contextual disparado por botón de fila o click derecho
    this.state.on('contextmenu:open', (detail) => {
      if (detail && detail.track) {
        this._showContextMenuAt(detail.track, detail.x, detail.y);
      }
    });
  }

  // Renderizar la lista de playlists del sidebar
  renderSidebar() {
    renderSidebarPlaylists(this.state.currentView, (playlistId) => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
      this.state.setView(`playlist:${playlistId}`);
    });
  }

  // Modal de creación de Playlists
  _initPlaylistsModal() {
    const modal = DOM.modals.playlist.overlay;
    const openBtn = DOM.sidebar.addPlaylistBtn;
    const closeBtn = DOM.modals.playlist.closeBtn;
    const cancelBtn = DOM.modals.playlist.cancelBtn;
    const saveBtn = DOM.modals.playlist.saveBtn;
    const nameInput = DOM.modals.playlist.nameInput;

    openBtn?.addEventListener('click', () => {
      if (nameInput) nameInput.value = '';
      modal?.classList.add('active');
      nameInput?.focus();
    });

    const closeModal = () => modal?.classList.remove('active');
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    saveBtn?.addEventListener('click', () => {
      const name = nameInput?.value.trim();
      if (!name) return;
      const newPlaylist = {
        id: 'pl_' + Date.now(),
        name,
        trackIds: []
      };
      Storage.savePlaylist(newPlaylist);
      closeModal();
      this.renderSidebar();
      showToast(`Playlist "${name}" creada`);
    });

    // Modal Añadir a playlist
    const addModal = DOM.modals.addToPlaylist.overlay;
    DOM.modals.addToPlaylist.closeBtn?.addEventListener('click', () => {
      addModal?.classList.remove('active');
    });
  }

  openAddToPlaylistModal(track) {
    const modal = DOM.modals.addToPlaylist.overlay;
    const container = DOM.modals.addToPlaylist.list;
    const playlists = Storage.getPlaylists();

    if (!container) return;

    if (playlists.length === 0) {
      container.innerHTML = `<div style="padding: 14px; text-align: center; color: var(--text-subdued); font-size: 13px;">No tienes playlists creadas todavía. Crea una desde la barra lateral.</div>`;
    } else {
      container.innerHTML = playlists.map(p => `
        <button class="pill-btn" data-playlist-id="${p.id}" style="justify-content: space-between; width: 100%;">
          <span>${escapeHtml(p.name)}</span>
          <span style="font-size: 11px; color: var(--text-subdued);">${(p.trackIds || []).length} pistas</span>
        </button>
      `).join('');

      container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const pId = btn.getAttribute('data-playlist-id');
          Storage.addTrackToPlaylist(pId, track.id);
          modal?.classList.remove('active');
          this.renderSidebar();
          showToast(`Añadida a la playlist`);
        });
      });
    }

    modal?.classList.add('active');
  }

  // Drawer de Cola de Reproducción
  _initQueueDrawer() {
    const queueBtn = DOM.queue.openBtn;
    const drawer = DOM.queue.drawer;
    const closeBtn = DOM.queue.closeBtn;

    queueBtn?.addEventListener('click', () => {
      drawer?.classList.toggle('open');
      const isOpen = drawer?.classList.contains('open');
      queueBtn.classList.toggle('active', isOpen);
      this.renderQueue();
    });

    closeBtn?.addEventListener('click', () => {
      drawer?.classList.remove('open');
      queueBtn?.classList.remove('active');
    });
  }

  renderQueue() {
    renderQueueList(
      this.audioEngine.queue,
      this.audioEngine.getCurrentTrack(),
      (idx) => {
        this.audioEngine.playTrackAtIndex(idx, true);
        this.renderQueue();
      },
      (idx) => {
        this.audioEngine.removeFromQueue(idx);
        this.renderQueue();
        this.state.emit('favorites:changed'); // refrescar vista activa
      }
    );
  }

  // Menú contextual nativo
  _initContextMenu() {
    const menu = DOM.contextMenu.menu;
    if (!menu) return;

    // Cerrar menú al hacer click en cualquier parte
    window.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    // Click derecho en filas o tarjetas de la cuadrícula
    window.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.track-row') || e.target.closest('.grid-card');
      if (row) {
        e.preventDefault();
        const trackId = row.getAttribute('data-track-id');
        const track = this.state.allTracks.find(t => t.id === trackId);
        if (track) {
          this._showContextMenuAt(track, e.clientX, e.clientY);
        }
      } else {
        menu.style.display = 'none';
      }
    });

    // Manejar acciones del menú contextual
    DOM.contextMenu.items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        const action = item.getAttribute('data-action');
        const track = this.state.selectedTrackForMenu;
        if (!track) return;

        if (action === 'play-now') {
          this.audioEngine.setQueue([track, ...this.state.allTracks.filter(t => t.id !== track.id)], 0, true);
        } else if (action === 'add-queue') {
          this.audioEngine.addToQueueNext(track);
          this.renderQueue();
          showToast(`"${track.title}" sonará a continuación`);
        } else if (action === 'add-to-playlist') {
          this.openAddToPlaylistModal(track);
        } else if (action === 'toggle-fav') {
          const isFav = Storage.toggleFavorite(track.id);
          showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
          this.state.emit('favorites:changed');
        } else if (action === 'show-in-folder') {
          platform.showItemInFolder(track.path);
        } else if (action === 'copy-path') {
          navigator.clipboard.writeText(track.path);
          showToast('Ruta copiada al portapapeles');
        } else if (action === 'remove-library') {
          this.state.removeTrackFromLibrary(track.id);
          showToast('Canción eliminada de la biblioteca');
        }
      });
    });
  }

  _showContextMenuAt(track, clientX, clientY) {
    const menu = DOM.contextMenu.menu;
    if (!menu) return;

    this.state.selectedTrackForMenu = track;
    const isFav = Storage.isFavorite(track.id);
    const favLabel = DOM.contextMenu.favLabel;
    if (favLabel) {
      favLabel.textContent = isFav ? 'Quitar de Favoritos' : 'Marcar como Favorito';
    }

    const x = Math.min(clientX, window.innerWidth - 240);
    const y = Math.min(clientY, window.innerHeight - 260);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'flex';
  }
}
