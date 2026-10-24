// Vista de Resultados de Búsqueda Categorizados Estilo YouTube Music (<200 líneas)
import { escapeHtml, formatTime } from '../utils/formatters.js';
import { Storage } from '../storage.js';
import { offlineManager } from '../services/offline-manager.js';

/**
 * Renderiza la vista de búsqueda categorizada
 * @param {HTMLElement} container 
 * @param {{ query: string, topResult: any, onlineTracks: Array<any>, localTracks: Array<any> }} results 
 * @param {{ onPlay: (track: any) => void, onDownload: (track: any) => void, onFavorite: (id: string) => void }} handlers 
 */
export function renderCategorizedSearch(container, results, handlers) {
  if (!container) return;
  const { query, topResult, onlineTracks = [], localTracks = [] } = results;
  const favs = Storage.getFavorites();

  if (!topResult && !onlineTracks.length && !localTracks.length) {
    container.innerHTML = `
      <div class="search-empty-state">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p>No se encontraron resultados para "${escapeHtml(query)}"</p>
      </div>
    `;
    return;
  }

  const topIsOff = topResult ? (topResult.isOffline || offlineManager.isOffline(topResult.id)) : false;
  const topResultHtml = topResult ? `
    <div class="search-top-column">
      <div class="search-top-result-card" data-id="${topResult.id}">
        <span class="search-badge-top">Mejor resultado</span>
        <div class="top-result-body">
          <div class="top-result-art">
            ${topResult.cover ? `<img src="${topResult.cover}" alt="Cover" loading="lazy">` : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
          </div>
          <div class="top-result-meta">
            <h3 class="top-result-title" title="${escapeHtml(topResult.title)}">${escapeHtml(topResult.title)}</h3>
            <span class="top-result-artist">${escapeHtml(topResult.artist)} · ${escapeHtml(topResult.album || 'Canción')}</span>
            <div class="top-result-actions">
              <button class="top-result-play-btn" data-action="play">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                <span>Reproducir</span>
              </button>
              <button class="top-result-dl-btn ${topIsOff ? 'is-offline' : ''}" data-action="download" title="${topIsOff ? 'Descargada' : 'Descargar'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${topIsOff ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const onlineListHtml = onlineTracks.slice(0, 5).map((t, idx) => _renderSearchTrackRow(t, favs, idx)).join('');

  const localListHtml = localTracks.length > 0 ? `
    <section class="search-section">
      <h2 class="search-section-title">En tu biblioteca y descargas</h2>
      <div class="search-online-list">
        ${localTracks.slice(0, 6).map((t, idx) => _renderSearchTrackRow(t, favs, idx)).join('')}
      </div>
    </section>
  ` : '';

  container.innerHTML = `
    <div class="search-results-grid">
      <div class="search-split-top">
        ${topResultHtml}
        <div class="search-online-column">
          <h2 class="search-section-title">Canciones Online</h2>
          <div class="search-online-list">
            ${onlineListHtml}
          </div>
        </div>
      </div>
      ${localListHtml}
    </div>
  `;

  _bindSearchEvents(container, [topResult, ...onlineTracks, ...localTracks].filter(Boolean), handlers);
}

function _renderSearchTrackRow(t, favs, idx) {
  const isOff = t.isOffline || offlineManager.isOffline(t.id);
  const isFav = favs.has(t.id);
  const coverHtml = t.cover ? `<img src="${t.cover}" alt="Cover" loading="lazy">` : `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

  return `
    <div class="search-track-row" data-id="${t.id}">
      <div class="search-row-left">
        <div class="search-row-thumb">
          ${coverHtml}
          <button class="search-row-play-btn" data-action="play" aria-label="Reproducir">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
        </div>
        <div class="search-row-info">
          <span class="search-row-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
          <span class="search-row-artist" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}${isOff ? ' · <span class="badge-offline">Offline</span>' : ''}</span>
        </div>
      </div>
      <span class="search-row-album" title="${escapeHtml(t.album || '')}">${escapeHtml(t.album || '')}</span>
      <div class="search-row-actions">
        <button class="search-row-dl-btn ${isOff ? 'is-offline' : ''}" data-action="download" title="${isOff ? 'Descargada' : 'Descargar'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${isOff ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'}
          </svg>
        </button>
        <button class="search-row-fav-btn ${isFav ? 'is-fav' : ''}" data-action="favorite" title="Favorito">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>
      <span class="search-row-duration">${formatTime(t.duration)}</span>
    </div>
  `;
}

function _bindSearchEvents(container, allTracks, handlers) {
  const map = new Map(allTracks.map(t => [t.id, t]));

  container.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const trackId = row.getAttribute('data-id');
    const track = map.get(trackId);
    if (!track) return;

    if (e.target.closest('[data-action="download"]')) {
      e.stopPropagation();
      if (handlers.onDownload) handlers.onDownload(track);
    } else if (e.target.closest('[data-action="favorite"]')) {
      e.stopPropagation();
      if (handlers.onFavorite) handlers.onFavorite(trackId);
    } else {
      if (handlers.onPlay) handlers.onPlay(track);
    }
  });
}
