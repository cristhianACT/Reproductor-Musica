// Servicio de Letras Sincronizadas en Tiempo Real mediante LRCLIB (<200 líneas)

const LRCLIB_API_BASE = 'https://lrclib.net/api';

class LyricsService {
  constructor() {
    /** @type {Map<string, { synced: Array<{time: number, text: string}>, plain: string }>} */
    this._cache = new Map();
  }

  /**
   * Obtiene las letras sincronizadas o planas de una canción
   * @param {string|{artist?: string, title?: string, duration?: number}} artistOrTrack 
   * @param {string} [maybeTitle] 
   * @param {number} [maybeDuration] 
   * @returns {Promise<{ synced: Array<{time: number, text: string}>, plain: string }>}
   */
  async getLyrics(artistOrTrack, maybeTitle, maybeDuration = 0) {
    let artist = '', title = '', duration = 0;
    if (typeof artistOrTrack === 'object' && artistOrTrack !== null) {
      artist = artistOrTrack.artist || ''; title = artistOrTrack.title || ''; duration = artistOrTrack.duration || 0;
    } else {
      artist = String(artistOrTrack || ''); title = String(maybeTitle || ''); duration = Number(maybeDuration || 0);
    }
    const cleanArtist = this._cleanQuery(artist);
    const cleanTitle = this._cleanQuery(title);
    if (!cleanTitle) return { synced: [], plain: '' };

    const cacheKey = `${cleanArtist} - ${cleanTitle}`.toLowerCase();
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey) || { synced: [], plain: '' };
    }

    try {
      // 1. Intento directo con /get
      let url = `${LRCLIB_API_BASE}/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
      if (duration > 0) url += `&duration=${Math.round(duration)}`;

      let res = await this._fetchWithTimeout(url, 3500);
      let data = res.ok ? await res.json() : null;

      // 2. Fallback con /search si /get no encontró coincidencias exactas
      if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
        const searchUrl = `${LRCLIB_API_BASE}/search?q=${encodeURIComponent(cleanArtist + ' ' + cleanTitle)}`;
        const searchRes = await this._fetchWithTimeout(searchUrl, 3500);
        if (searchRes.ok) {
          const list = await searchRes.json();
          if (Array.isArray(list) && list.length > 0) {
            data = list.find((item) => item.syncedLyrics) || list[0];
          }
        }
      }

      if (!data) return { synced: [], plain: '' };

      const synced = data.syncedLyrics ? this._parseLrc(data.syncedLyrics) : [];
      const plain = data.plainLyrics || '';
      const result = { synced, plain };

      this._cache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('Error al obtener letras de LRCLIB:', err);
      return { synced: [], plain: '' };
    }
  }

  /**
   * Parsea contenido LRC a lista de objetos con timestamp en segundos
   * @param {string} lrcText 
   * @returns {Array<{time: number, text: string}>}
   */
  _parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const lrcRegex = /^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/;

    for (const rawLine of lines) {
      const match = rawLine.trim().match(lrcRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseFloat(match[2]);
        const time = mins * 60 + secs;
        const text = (match[3] || '').trim();
        result.push({ time, text });
      }
    }

    return result.sort((a, b) => a.time - b.time);
  }

  _cleanQuery(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/(\[.*?\]|\(.*?\))/g, '') // Elimina (Official Video), [Audio], etc.
      .replace(/ft\.|feat\.|featuring/gi, '')
      .replace(/[^\w\s\u00C0-\u017F]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async _fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }
}

export const lyricsService = new LyricsService();
