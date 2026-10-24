// @ts-check
// Vista de Letras Sincronizadas en Tiempo Real (Emil Kowalski + Impeccable) (<200 líneas)
import { escapeHtml } from '../utils/formatters.js';
import { lyricsService } from '../services/lyrics-service.js';

let _activeLineIndex = -1;
let _currentLyrics = /** @type {Array<{time: number, text: string}>} */ ([]);
let _isOpen = false;
let _onSeekCallback = /** @type {((sec: number) => void)|null} */ (null);

export function initLyricsView(onSeek) {
  _onSeekCallback = onSeek;
  const panel = document.getElementById('lyricsPanel');
  const closeBtn = document.getElementById('closeLyricsBtn');
  const lyricsBtn = document.getElementById('lyricsBtn');

  closeBtn?.addEventListener('click', () => toggleLyricsPanel(false));
  lyricsBtn?.addEventListener('click', () => toggleLyricsPanel());
}

export function toggleLyricsPanel(forceState) {
  const panel = document.getElementById('lyricsPanel');
  const btn = document.getElementById('lyricsBtn');
  _isOpen = typeof forceState === 'boolean' ? forceState : !_isOpen;

  panel?.classList.toggle('active', _isOpen);
  btn?.classList.toggle('active', _isOpen);

  if (_isOpen) {
    const activeEl = document.querySelector('.lyric-line.is-active');
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return _isOpen;
}

export function isLyricsOpen() {
  return _isOpen;
}

export async function loadLyricsForTrack(track) {
  const container = document.getElementById('lyricsContent');
  const titleEl = document.getElementById('lyricsTrackTitle');
  const artistEl = document.getElementById('lyricsTrackArtist');

  if (!container) return;
  _activeLineIndex = -1;
  _currentLyrics = [];

  if (!track) {
    container.innerHTML = `<div class="lyrics-empty">Selecciona una canción para ver sus letras</div>`;
    return;
  }

  if (titleEl) titleEl.textContent = track.title || 'Canción';
  if (artistEl) artistEl.textContent = track.artist || 'Artista';

  container.innerHTML = `
    <div class="lyrics-loading">
      <div class="lyrics-spinner"></div>
      <span>Buscando letras sincronizadas...</span>
    </div>
  `;

  try {
    const data = await lyricsService.getLyrics(track.artist, track.title, track.duration);
    if (data.synced && data.synced.length > 0) {
      _currentLyrics = data.synced;
      container.innerHTML = data.synced.map((line, idx) => `
        <div class="lyric-line" data-index="${idx}" data-time="${line.time}">
          ${escapeHtml(line.text || '...')}
        </div>
      `).join('');

      container.querySelectorAll('.lyric-line').forEach(el => {
        el.addEventListener('click', () => {
          const t = parseFloat(el.getAttribute('data-time') || '0');
          if (_onSeekCallback) _onSeekCallback(t);
        });
      });
    } else if (data.plain) {
      container.innerHTML = `<div class="lyrics-plain">${escapeHtml(data.plain).replace(/\n/g, '<br>')}</div>`;
    } else {
      container.innerHTML = `
        <div class="lyrics-empty">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <p>No se encontraron letras disponibles</p>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="lyrics-empty">Error cargando letras</div>`;
  }
}

export function updateLyricsTime(currentTime) {
  if (!_currentLyrics.length) return;
  let newIndex = -1;

  for (let i = 0; i < _currentLyrics.length; i++) {
    if (currentTime >= _currentLyrics[i].time) {
      newIndex = i;
    } else {
      break;
    }
  }

  if (newIndex !== _activeLineIndex) {
    _activeLineIndex = newIndex;
    const lines = document.querySelectorAll('.lyric-line');
    lines.forEach((line, idx) => {
      line.classList.toggle('is-active', idx === newIndex);
      line.classList.toggle('is-past', idx < newIndex);
    });

    if (_isOpen && newIndex >= 0) {
      const activeEl = lines[newIndex];
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
