// @ts-check
// Vista de Inicio (Home Feed) Estilo YouTube Music + Impeccable (<250 líneas)
import { escapeHtml, formatTime } from '../utils/formatters.js';
import { Storage } from '../storage.js';
import { offlineManager } from '../services/offline-manager.js';

const MOODS = ['Todo', 'Energía', 'Relax', 'Concentración', 'Entrenamiento', 'Romance', 'Fiesta'];
let _activeMood = 'Todo';

/**
 * Renderiza la pantalla principal de Inicio
 * @param {HTMLElement} container 
 * @param {{ mood: string, quickPicks: Array<any>, trendingHits: Array<any> }} feedData 
 * @param {{ onPlay: (track: any) => void, onDownload: (track: any) => void, onMoodSelect: (mood: string) => void }} handlers 
 */
export function renderHomeFeed(container, feedData, handlers) {
  if (!container) return;
  _activeMood = feedData.mood || 'Todo';
  const history = Storage.getHistory();
  const { quickPicks = [], trendingHits = [] } = feedData;

  const moodPillsHtml = `
    <div class="home-mood-scroll">
      ${MOODS.map(m => `
        <button class="mood-pill ${m === _activeMood ? 'active' : ''}" data-mood="${m}">
          ${m}
        </button>
      `).join('')}
    </div>
  `;

  const quickPicksHtml = quickPicks.length > 0 ? `
    <section class="home-section">
      <div class="home-section-header">
        <span class="home-section-subtitle">EMPIEZA A ESCUCHAR</span>
        <h2 class="home-section-title">Selección Rápida</h2>
      </div>
      <div class="quick-picks-grid">
        ${quickPicks.map((t, i) => _renderQuickPickCard(t, i)).join('')}
      </div>
    </section>
  ` : '';

  const trendingHtml = trendingHits.length > 0 ? `
    <section class="home-section">
      <div class="home-section-header">
        <span class="home-section-subtitle">LO MÁS ESCUCHADO</span>
        <h2 class="home-section-title">Tendencias Globales · Top Hits</h2>
      </div>
      <div class="home-carousel-scroll">
        ${trendingHits.map((t) => _renderTrendingCard(t)).join('')}
      </div>
    </section>
  ` : '';

  const historyHtml = history.length > 0 ? `
    <section class="home-section">
      <div class="home-section-header">
        <span class="home-section-subtitle">TUS RECIENTES</span>
        <h2 class="home-section-title">Volver a Escuchar</h2>
      </div>
      <div class="home-carousel-scroll">
        ${history.slice(0, 10).map((t) => _renderTrendingCard(t)).join('')}
      </div>
    </section>
  ` : '';

  container.innerHTML = `
    <div class="home-feed-wrapper">
      ${moodPillsHtml}
      ${quickPicksHtml}
      ${trendingHtml}
      ${historyHtml}
    </div>
  `;

  _bindHomeEvents(container, feedData, history, handlers);
}

function _renderQuickPickCard(t, idx) {
  const isOff = t.isOffline || offlineManager.isOffline(t.id);
  const coverHtml = t.cover ? `<img src="${t.cover}" alt="Cover" loading="lazy">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

  return `
    <div class="quick-pick-item" data-id="${t.id}" data-type="quick" data-index="${idx}">
      <div class="quick-pick-art">
        ${coverHtml}
        <button class="quick-pick-play" title="Reproducir">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        </button>
      </div>
      <div class="quick-pick-info">
        <span class="quick-pick-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
        <span class="quick-pick-artist" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</span>
      </div>
      <button class="quick-pick-dl ${isOff ? 'is-offline' : ''}" data-action="download" title="${isOff ? 'Disponible Offline' : 'Descargar Offline'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${isOff ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'}
        </svg>
      </button>
    </div>
  `;
}

function _renderTrendingCard(t) {
  const isOff = t.isOffline || offlineManager.isOffline(t.id);
  const coverHtml = t.cover ? `<img src="${t.cover}" alt="Cover" loading="lazy">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

  return `
    <div class="home-card" data-id="${t.id}">
      <div class="home-card-art">
        ${coverHtml}
        <button class="home-card-play" data-action="play" title="Reproducir">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        </button>
        ${isOff ? `<span class="home-card-badge">OFFLINE</span>` : ''}
      </div>
      <span class="home-card-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
      <span class="home-card-sub" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</span>
    </div>
  `;
}

function _bindHomeEvents(container, feedData, history, handlers) {
  const allTracksMap = new Map();
  (feedData.quickPicks || []).forEach(t => allTracksMap.set(t.id, t));
  (feedData.trendingHits || []).forEach(t => allTracksMap.set(t.id, t));
  (history || []).forEach(t => allTracksMap.set(t.id, t));

  container.addEventListener('click', (e) => {
    // @ts-ignore
    const moodBtn = e.target.closest('.mood-pill');
    if (moodBtn) {
      const mood = moodBtn.getAttribute('data-mood');
      if (mood && handlers.onMoodSelect) handlers.onMoodSelect(mood);
      return;
    }

    // @ts-ignore
    const dlBtn = e.target.closest('[data-action="download"]');
    if (dlBtn) {
      // @ts-ignore
      const item = dlBtn.closest('[data-id]');
      const trackId = item?.getAttribute('data-id');
      const track = allTracksMap.get(trackId);
      if (track && handlers.onDownload) handlers.onDownload(track);
      return;
    }

    // @ts-ignore
    const card = e.target.closest('.quick-pick-item, .home-card');
    if (card) {
      const trackId = card.getAttribute('data-id');
      const track = allTracksMap.get(trackId);
      if (track && handlers.onPlay) handlers.onPlay(track);
    }
  });
}
