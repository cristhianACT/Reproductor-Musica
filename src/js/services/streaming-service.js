// @ts-check
// Servicio de Catálogo, Home Feed, Streaming y Radio Infinita (<250 líneas)
const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.privacydev.net', 'https://pipedapi.leptons.xyz', 'https://piped-api.lunar.icu'];
const INVID = ['https://yt.chocolatemoo53.com', 'https://invidious.materialio.us', 'https://yewtu.be', 'https://invidious.slipfox.xyz'];
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const TIMEOUT_MS = 3200;

const MOODS = {
  'Todo': 'Top Hits Worldwide',
  'Energía': 'Electronic Dance Pop',
  'Relax': 'Lofi Chill Acoustic',
  'Concentración': 'Ambient Synthwave Focus',
  'Entrenamiento': 'Workout Phonk Trap',
  'Romance': 'Love Songs R&B Indie',
  'Fiesta': 'Latin Pop Reggaeton EDM'
};

class StreamingService {
  constructor() {
    this._searchCache = new Map();
    this._streamCache = new Map();
    this._homeCache = new Map();
    this._pIdx = 0;
    this._iIdx = 0;
  }

  async getHomeFeed(mood = 'Todo') {
    const key = mood.toLowerCase();
    if (this._homeCache.has(key)) return this._homeCache.get(key);
    const query = MOODS[mood] || MOODS['Todo'];
    const tracks = await this.searchGlobalTracks(query);
    const quickPicks = tracks.slice(0, 6);
    const trendingHits = tracks.slice(6, 18);
    const feed = { mood, quickPicks, trendingHits };
    this._homeCache.set(key, feed);
    return feed;
  }

  async getRelatedTracks(track) {
    if (!track) return [];
    const query = `${track.artist} similar music`;
    const results = await this.searchGlobalTracks(query);
    return results.filter(t => t.id !== track.id && t.title !== track.title).slice(0, 8);
  }

  async searchGlobalTracks(query) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return [];
    const key = q.toLowerCase();
    if (this._searchCache.has(key)) return this._searchCache.get(key) || [];

    try {
      const itunes = await this._searchItunes(q);
      if (itunes.length > 0) { this._searchCache.set(key, itunes); return itunes; }
    } catch (e) {}

    const invid = await this._searchInvidious(q);
    if (invid.length > 0) { this._searchCache.set(key, invid); return invid; }

    const piped = await this._searchPiped(q);
    this._searchCache.set(key, piped);
    return piped;
  }

  async getAudioStreamUrl(track) {
    if (!track) return '';
    const cacheId = track.videoId || track.id || track.path;
    if (this._streamCache.has(cacheId)) return this._streamCache.get(cacheId) || '';

    if (track.videoId) {
      const url = await this._resolveStream(track.videoId);
      if (url) { this._streamCache.set(cacheId, url); return url; }
    }
    if (track.artist && track.title) {
      const vId = await this._resolveVideoId(track.artist, track.title);
      if (vId) {
        track.videoId = vId;
        const url = await this._resolveStream(vId);
        if (url) { this._streamCache.set(cacheId, url); return url; }
      }
    }
    const fallback = track.previewUrl || (track.path?.startsWith('http') ? track.path : '');
    if (fallback) this._streamCache.set(cacheId, fallback);
    return fallback;
  }

  async _searchItunes(query) {
    const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=25`;
    const res = await this._fetch(url, TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((r) => ({
      id: 'online_' + r.trackId,
      trackId: r.trackId,
      videoId: null,
      title: r.trackName,
      artist: r.artistName || 'Artista Desconocido',
      album: r.collectionName || 'Single',
      duration: Math.round((r.trackTimeMillis || 0) / 1000),
      cover: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : null,
      path: r.previewUrl || '',
      previewUrl: r.previewUrl || '',
      isOnline: true,
      isOffline: false
    }));
  }

  async _searchInvidious(query) {
    for (let i = 0; i < INVID.length; i++) {
      const base = INVID[(this._iIdx + i) % INVID.length];
      try {
        const res = await this._fetch(`${base}/api/v1/search?q=${encodeURIComponent(query + ' audio')}&type=video`, TIMEOUT_MS);
        if (!res.ok) continue;
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          this._iIdx = (this._iIdx + i) % INVID.length;
          return items.slice(0, 25).map((item) => ({
            id: 'online_' + item.videoId,
            videoId: item.videoId,
            title: item.title,
            artist: item.author || 'Artista Desconocido',
            album: 'YouTube Music',
            duration: item.lengthSeconds || 0,
            cover: item.videoThumbnails?.[0]?.url?.startsWith('http') ? item.videoThumbnails[0].url : `${base}${item.videoThumbnails?.[0]?.url || ''}`,
            path: '',
            isOnline: true,
            isOffline: false
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  async _searchPiped(query) {
    for (let i = 0; i < PIPED.length; i++) {
      const base = PIPED[(this._pIdx + i) % PIPED.length];
      try {
        const res = await this._fetch(`${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`, TIMEOUT_MS);
        if (!res.ok) continue;
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          this._pIdx = (this._pIdx + i) % PIPED.length;
          return items.slice(0, 25).map((item) => ({
            id: 'online_' + (item.url ? item.url.replace('/watch?v=', '') : item.id),
            videoId: item.url ? item.url.replace('/watch?v=', '') : item.id,
            title: item.title,
            artist: item.uploaderName || 'Artista Desconocido',
            album: 'Streaming Global',
            duration: item.duration || 0,
            cover: item.thumbnail || null,
            path: '',
            isOnline: true,
            isOffline: false
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  async _resolveVideoId(artist, title) {
    const q = `${artist} ${title} official audio`;
    for (const base of INVID) {
      try {
        const res = await this._fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, 2400);
        if (!res.ok) continue;
        const items = await res.json();
        if (items?.[0]?.videoId) return items[0].videoId;
      } catch (e) {}
    }
    return null;
  }

  async _resolveStream(videoId) {
    for (const base of INVID) {
      try {
        const res = await this._fetch(`${base}/api/v1/videos/${videoId}`, TIMEOUT_MS);
        if (!res.ok) continue;
        const data = await res.json();
        const audios = (data.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
        const m4a = audios.find(f => f.container === 'm4a') || audios[0];
        if (m4a?.url?.startsWith('http')) return m4a.url;
        if (data.formatStreams?.[0]?.url?.startsWith('http')) return data.formatStreams[0].url;
      } catch (e) {}
    }
    for (const base of PIPED) {
      try {
        const res = await this._fetch(`${base}/streams/${videoId}`, TIMEOUT_MS);
        if (!res.ok) continue;
        const data = await res.json();
        const audios = data.audioStreams || [];
        const bestAudio = audios.find(a => a.format === 'M4A') || audios[0];
        if (bestAudio?.url?.startsWith('http')) return bestAudio.url;
      } catch (e) {}
    }
    return '';
  }

  async _fetch(url, timeoutMs) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }
}

export const streamingService = new StreamingService();
