// Vista de Lista de Canciones con Virtual Scroll Ligero y Event Delegation (<250 líneas)
import { DOM } from './dom-elements.js';
import { formatTime, escapeHtml } from '../utils/formatters.js';
import { Storage } from '../storage.js';
export { renderAlbumsGrid, renderArtistsGrid } from './grid-view.js';

const ROW_HEIGHT = 56;
const VIRTUAL_THRESHOLD = 80;
let _virtualScrollBound = false;
let _scrollRafId = null;

let _currentTableState = {
  tracks: /** @type {Array<any>} */ ([]),
  currentTrack: /** @type {any} */ (null),
  isPlaying: false,
  handlers: /** @type {any} */ (null)
};

export function renderHeroBanner(currentView, allTracks) {
  const { heroTitle, heroTag, heroCover } = DOM.content;
  if (currentView === 'library') {
    if (heroTag) heroTag.textContent = 'Colección';
    if (heroTitle) heroTitle.textContent = 'Tu Biblioteca';
    if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
  } else if (currentView === 'favorites') {
    if (heroTag) heroTag.textContent = 'Lista';
    if (heroTitle) heroTitle.textContent = 'Tus Favoritos';
    if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="var(--accent-cyan)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
  } else if (currentView === 'albums') {
    if (heroTag) heroTag.textContent = 'Explorar';
    if (heroTitle) heroTitle.textContent = 'Álbumes';
    if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
  } else if (currentView === 'artists') {
    if (heroTag) heroTag.textContent = 'Explorar';
    if (heroTitle) heroTitle.textContent = 'Artistas';
    if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
  } else if (currentView.startsWith('album:')) {
    const albumName = decodeURIComponent(currentView.replace('album:', ''));
    if (heroTag) heroTag.textContent = 'Álbum';
    if (heroTitle) heroTitle.textContent = albumName;
    const tracks = allTracks.filter(t => t.album === albumName);
    const firstCover = tracks.find(t => t.cover)?.cover;
    if (heroCover) heroCover.innerHTML = firstCover ? `<img src="${firstCover}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
  } else if (currentView.startsWith('artist:')) {
    const artistName = decodeURIComponent(currentView.replace('artist:', ''));
    if (heroTag) heroTag.textContent = 'Artista';
    if (heroTitle) heroTitle.textContent = artistName;
    if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
  } else if (currentView.startsWith('playlist:')) {
    const playlist = Storage.getPlaylists().find(p => p.id === currentView.replace('playlist:', ''));
    if (playlist) {
      if (heroTag) heroTag.textContent = 'Playlist';
      if (heroTitle) heroTitle.textContent = playlist.name;
      if (heroCover) heroCover.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
    }
  }
}

function _renderTrackRowHtml(track, idx, currentTrack, isPlaying, favs) {
  const isThisTrack = currentTrack && currentTrack.id === track.id;
  const isFav = favs.has(track.id);
  const coverHtml = track.cover ? `<img src="${track.cover}" alt="Cover">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

  return `
    <tr class="track-row ${isThisTrack ? 'active' : ''} ${isThisTrack && isPlaying ? 'is-playing' : ''}" data-track-id="${track.id}" data-index="${idx}">
      <td class="col-num-cell">
        <span class="track-index">${idx + 1}</span>
        <span class="track-play-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            ${isThisTrack && isPlaying ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21 5 3"/>'}
          </svg>
        </span>
        <div class="equalizer-indicator"><span class="equalizer-bar"></span><span class="equalizer-bar"></span><span class="equalizer-bar"></span><span class="equalizer-bar"></span></div>
      </td>
      <td>
        <div class="track-main-cell">
          <div class="track-thumb">${coverHtml}</div>
          <div class="track-meta-wrap">
            <span class="track-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>
            <span class="track-artist" title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</span>
          </div>
        </div>
      </td>
      <td class="track-album" title="${escapeHtml(track.album)}">${escapeHtml(track.album)}</td>
      <td class="track-duration">${formatTime(track.duration)}</td>
      <td class="track-actions-cell">
        <button class="heart-btn ${isFav ? 'is-fav' : ''}" data-action="favorite" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <button class="more-btn" data-action="context-trigger" title="Más opciones"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/></svg></button>
      </td>
    </tr>
  `;
}

function _initEventDelegationOnce(tbody) {
  // @ts-ignore
  if (tbody._hasEventDelegation) return;
  // @ts-ignore
  tbody._hasEventDelegation = true;

  tbody.addEventListener('click', (e) => {
    // @ts-ignore
    const row = e.target.closest('.track-row');
    if (!row) return;
    const idx = parseInt(row.getAttribute('data-index'), 10);
    const trackId = row.getAttribute('data-track-id');
    const { tracks, handlers } = _currentTableState;
    if (!handlers || !tracks) return;

    // @ts-ignore
    if (e.target.closest('.track-play-icon')) {
      e.stopPropagation();
      handlers.onPlayClick?.(tracks, idx, trackId);
    // @ts-ignore
    } else if (e.target.closest('[data-action="favorite"]')) {
      e.stopPropagation();
      handlers.onFavoriteClick?.(trackId);
    // @ts-ignore
    } else if (e.target.closest('[data-action="context-trigger"]')) {
      e.stopPropagation();
      handlers.onContextMenuTrigger?.(trackId, e);
    }
  });

  tbody.addEventListener('dblclick', (e) => {
    // @ts-ignore
    const row = e.target.closest('.track-row');
    if (!row) return;
    _currentTableState.handlers?.onDoubleClick?.(_currentTableState.tracks, parseInt(row.getAttribute('data-index'), 10));
  });
}

function _renderVirtualRows() {
  const { tracks, currentTrack, isPlaying } = _currentTableState;
  const { trackListBody: tbody, scrollArea, trackTable: table } = DOM.content;
  if (!tbody || !scrollArea || !table || tracks.length === 0) return;

  const favs = Storage.getFavorites();
  if (tracks.length <= VIRTUAL_THRESHOLD) {
    tbody.innerHTML = tracks.map((t, idx) => _renderTrackRowHtml(t, idx, currentTrack, isPlaying, favs)).join('');
    return;
  }

  const scrollTop = scrollArea.scrollTop;
  const offsetTop = (table.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top) + scrollTop;
  const BUFFER = 6;
  const startIndex = Math.max(0, Math.floor((scrollTop - offsetTop) / ROW_HEIGHT) - BUFFER);
  const visibleCount = Math.ceil(scrollArea.clientHeight / ROW_HEIGHT) + (BUFFER * 2);
  const endIndex = Math.min(tracks.length, startIndex + visibleCount);

  const topPadding = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (tracks.length - endIndex) * ROW_HEIGHT);

  let rowsHtml = topPadding > 0 ? `<tr style="height:${topPadding}px;border:none;pointer-events:none;"><td colspan="5" style="height:${topPadding}px;padding:0;border:none;"></td></tr>` : '';
  for (let i = startIndex; i < endIndex; i++) {
    rowsHtml += _renderTrackRowHtml(tracks[i], i, currentTrack, isPlaying, favs);
  }
  if (bottomPadding > 0) {
    rowsHtml += `<tr style="height:${bottomPadding}px;border:none;pointer-events:none;"><td colspan="5" style="height:${bottomPadding}px;padding:0;border:none;"></td></tr>`;
  }
  tbody.innerHTML = rowsHtml;
}

export function renderTrackTable(tracks, currentTrack, isPlaying, searchQuery, handlers) {
  const { trackListBody: tbody, trackTable: table, emptyState, heroTrackCount, heroDuration, emptyStateTitle } = DOM.content;
  if (heroTrackCount) heroTrackCount.textContent = `${tracks.length} canciones`;
  const totalSecs = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const mins = Math.floor(totalSecs / 60);
  if (heroDuration) heroDuration.textContent = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;

  if (tracks.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (table) table.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    if (emptyStateTitle) emptyStateTitle.textContent = searchQuery ? `No se encontraron resultados para "${searchQuery}"` : 'Tu biblioteca está esperando tu música';
    return;
  }

  if (table) table.style.display = 'table';
  if (emptyState) emptyState.style.display = 'none';

  _currentTableState = { tracks, currentTrack, isPlaying, handlers };
  if (tbody) _initEventDelegationOnce(tbody);

  if (!_virtualScrollBound) {
    _virtualScrollBound = true;
    DOM.content.scrollArea?.addEventListener('scroll', () => {
      if (_currentTableState.tracks.length > VIRTUAL_THRESHOLD) {
        if (_scrollRafId) cancelAnimationFrame(_scrollRafId);
        _scrollRafId = requestAnimationFrame(() => _renderVirtualRows());
      }
    }, { passive: true });
  }

  _renderVirtualRows();
}
