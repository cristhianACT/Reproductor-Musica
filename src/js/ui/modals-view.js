// Gestión de Modales, Toasts, Drawer de Cola y Playlists en el Sidebar
import { DOM } from './dom-elements.js';
import { escapeHtml } from '../utils/formatters.js';
import { Storage } from '../storage.js';

let toastTimeout;

export function showToast(message) {
  const toast = DOM.toast;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

export function renderQueueList(queue, currentTrack, onPlayTrack, onRemoveTrack) {
  const list = DOM.queue.list;
  if (!list) return;

  if (!queue || queue.length === 0) {
    list.innerHTML = `<div style="padding: 20px; font-size: 13px; color: var(--text-subdued); text-align: center;">No hay canciones en la cola</div>`;
    return;
  }

  list.innerHTML = queue.map((track, idx) => {
    const isCur = currentTrack && currentTrack.id === track.id;
    return `
      <div class="queue-item ${isCur ? 'active' : ''}" data-index="${idx}">
        <div style="font-size: 11px; color: var(--text-subdued); width: 20px; text-align: center;">
          ${isCur ? '▶' : idx + 1}
        </div>
        <div class="queue-item-info">
          <div class="queue-item-title">${escapeHtml(track.title)}</div>
          <div class="queue-item-artist">${escapeHtml(track.artist)}</div>
        </div>
        <button class="icon-btn-subtle queue-remove-btn" data-index="${idx}" title="Quitar de la cola" style="opacity: 0.7;">
          <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // @ts-ignore
      if (e.target.closest('.queue-remove-btn')) return;
      const idx = parseInt(item.getAttribute('data-index') || '0', 10);
      onPlayTrack?.(idx);
    });
  });

  list.querySelectorAll('.queue-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index') || '0', 10);
      onRemoveTrack?.(idx);
    });
  });
}

export function renderSidebarPlaylists(currentView, onSelectPlaylist) {
  const listContainer = DOM.sidebar.playlistList;
  if (!listContainer) return;

  const playlists = Storage.getPlaylists();
  if (playlists.length === 0) {
    listContainer.innerHTML = `<div style="padding: 10px; font-size: 12px; color: var(--text-subdued); text-align: center;">Crea tu primera lista con el botón +</div>`;
    return;
  }

  listContainer.innerHTML = playlists.map(p => {
    const isActive = currentView === `playlist:${p.id}`;
    return `
      <div class="playlist-item ${isActive ? 'active' : ''}" data-playlist-id="${p.id}">
        <div class="playlist-thumb">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </div>
        <div class="playlist-info">
          <span class="playlist-name">${escapeHtml(p.name)}</span>
          <span class="playlist-meta">${(p.trackIds || []).length} canciones</span>
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const pId = item.getAttribute('data-playlist-id');
      onSelectPlaylist?.(pId);
    });
  });
}

export function renderEqPresets(presets, activePresetKey, onSelectPreset) {
  const presetsContainer = DOM.modals.eq.presetsContainer;
  if (!presetsContainer) return;

  presetsContainer.innerHTML = Object.entries(presets).map(([key, p]) => {
    const isActive = activePresetKey === key;
    return `<button class="preset-chip ${isActive ? 'active' : ''}" data-preset="${key}">${p.name}</button>`;
  }).join('');

  presetsContainer.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      presetsContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const key = chip.getAttribute('data-preset');
      onSelectPreset?.(key);
    });
  });
}

export function updateEqSliders(bands) {
  bands.forEach((val, idx) => {
    const slider = /** @type {HTMLInputElement|null} */ (document.querySelector(`.eq-slider[data-band="${idx}"]`));
    if (slider) slider.value = String(val);
    const label = document.getElementById(`eqVal${idx}`);
    if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;
  });
}
