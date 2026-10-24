// Vista de Cuadrícula para Álbumes y Artistas (Grid View)
import { DOM } from './dom-elements.js';
import { escapeHtml } from '../utils/formatters.js';

export function renderAlbumsGrid(allTracks, onSelectAlbum, onPlayAlbum) {
  const table = DOM.content.trackTable;
  const grid = DOM.content.gridView;
  const emptyState = DOM.content.emptyState;
  if (table) table.style.display = 'none';

  const albumsMap = new Map();
  for (const track of allTracks) {
    const alb = track.album || 'Álbum desconocido';
    if (!albumsMap.has(alb)) albumsMap.set(alb, { name: alb, artist: track.artist, cover: track.cover, tracks: [] });
    const item = albumsMap.get(alb);
    item.tracks.push(track);
    if (!item.cover && track.cover) item.cover = track.cover;
  }

  const albums = Array.from(albumsMap.values());
  if (albums.length === 0) {
    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (grid) {
    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = albums.map(a => `
      <div class="grid-card" data-album="${encodeURIComponent(a.name)}">
        <div class="grid-card-art">
          ${a.cover ? `<img src="${a.cover}" alt="Cover">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`}
        </div>
        <button class="grid-card-play-btn" data-play-album="${encodeURIComponent(a.name)}" title="Reproducir álbum"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
        <div class="grid-card-info">
          <div class="grid-card-title">${escapeHtml(a.name)}</div>
          <div class="grid-card-subtitle">${escapeHtml(a.artist)} • ${a.tracks.length} canciones</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.grid-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // @ts-ignore
        if (e.target.closest('.grid-card-play-btn')) return;
        onSelectAlbum?.(card.getAttribute('data-album'));
      });
    });

    grid.querySelectorAll('.grid-card-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alb = decodeURIComponent(btn.getAttribute('data-play-album') || '');
        const albumObj = albumsMap.get(alb);
        if (albumObj?.tracks?.length > 0) onPlayAlbum?.(albumObj.tracks);
      });
    });
  }
}

export function renderArtistsGrid(allTracks, onSelectArtist, onPlayArtist) {
  const table = DOM.content.trackTable;
  const grid = DOM.content.gridView;
  const emptyState = DOM.content.emptyState;
  if (table) table.style.display = 'none';

  const artistsMap = new Map();
  for (const track of allTracks) {
    const art = track.artist || 'Artista desconocido';
    if (!artistsMap.has(art)) artistsMap.set(art, { name: art, cover: track.cover, tracks: [] });
    const item = artistsMap.get(art);
    item.tracks.push(track);
    if (!item.cover && track.cover) item.cover = track.cover;
  }

  const artists = Array.from(artistsMap.values());
  if (artists.length === 0) {
    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (grid) {
    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = artists.map(a => `
      <div class="grid-card" data-artist="${encodeURIComponent(a.name)}" style="text-align: center; align-items: center;">
        <div class="grid-card-art artist-avatar" style="width: 140px; height: 140px;">
          ${a.cover ? `<img src="${a.cover}" alt="Avatar">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`}
        </div>
        <button class="grid-card-play-btn" data-play-artist="${encodeURIComponent(a.name)}" title="Reproducir artista"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
        <div class="grid-card-info" style="align-items: center;">
          <div class="grid-card-title">${escapeHtml(a.name)}</div>
          <div class="grid-card-subtitle">${a.tracks.length} canciones</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.grid-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // @ts-ignore
        if (e.target.closest('.grid-card-play-btn')) return;
        onSelectArtist?.(card.getAttribute('data-artist'));
      });
    });

    grid.querySelectorAll('.grid-card-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const art = decodeURIComponent(btn.getAttribute('data-play-artist') || '');
        const artistObj = artistsMap.get(art);
        if (artistObj?.tracks?.length > 0) onPlayArtist?.(artistObj.tracks);
      });
    });
  }
}
