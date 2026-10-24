// Servicio de Catálogo Comercial (iTunes + Audius) y Extractor de Audio Libre (<250 líneas)
import { platform } from '../core/platform-bridge.js';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const ITUNES_CHARTS = 'https://itunes.apple.com/us/rss/topsongs/limit=25/json';
const AUDIUS_TRENDING = 'https://discoveryprovider.audius.co/v1/tracks/trending?app_name=AuraMusicPlayer&limit=15';
const INVIDIOUS_HOSTS = ['https://yt.chocolatemoo53.com', 'https://inv.nadeko.net', 'https://invidious.tiekoetter.com'];
const TIMEOUT_MS = 2500;

const MOODS = {
  'Todo': 'Top Hits Worldwide',
  'Energía': 'Electronic Dance Party Hits',
  'Relax': 'Acoustic Lo-Fi Chill',
  'Concentración': 'Ambient Study Piano Focus',
  'Entrenamiento': 'Workout Fitness Energy Motivation',
  'Romance': 'Romantic Love Songs Ballads',
  'Fiesta': 'Latin Pop Reggaeton Hits'
};

class StreamingService {
  constructor() {
    this._searchCache = new Map();
    this._streamCache = new Map();
    this._homeCache = new Map();
    this._hostIdx = 0;
  }

  async getHomeFeed(mood = 'Todo') {
    const key = mood.toLowerCase();
    if (this._homeCache.has(key)) return this._homeCache.get(key);

    let tracks = [];
    if (mood === 'Todo') {
      tracks = await this._getChartsFeed();
      if (!tracks.length) tracks = await this.searchGlobalTracks(MOODS['Todo']);
    } else {
      tracks = await this.searchGlobalTracks(MOODS[mood] || MOODS['Todo']);
    }

    const feed = { mood, quickPicks: tracks.slice(0, 6), trendingHits: tracks.slice(6, 20) };
    this._homeCache.set(key, feed);
    return feed;
  }

  async _getChartsFeed() {
    try {
      const res = await this._fetch(ITUNES_CHARTS, 3000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.feed?.entry || []).map(e => ({
        id: `itunes_chart_${e.id?.attributes?.['im:id'] || Math.random().toString(36).substr(2, 6)}`,
        title: e['im:name']?.label || 'Canción',
        artist: e['im:artist']?.label || 'Artista',
        album: e['im:collection']?.['im:name']?.label || 'Top Hit',
        duration: 210,
        cover: (e['im:image']?.[2]?.label || '').replace('170x170bb', '600x600bb'),
        previewUrl: e.link?.[1]?.attributes?.href || '',
        isOnline: true,
        isOffline: false
      }));
    } catch (e) {
      return this._getAudiusTrending();
    }
  }

  async _getAudiusTrending() {
    try {
      const res = await this._fetch(AUDIUS_TRENDING, 3000);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map(t => ({
        id: `audius_${t.id}`,
        audiusId: t.id,
        title: t.title,
        artist: t.user?.name || 'Artista Audius',
        album: 'Audius Trending',
        duration: t.duration || 180,
        cover: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
        previewUrl: `https://discoveryprovider.audius.co/v1/tracks/${t.id}/stream?app_name=AuraMusicPlayer`,
        isOnline: true,
        isOffline: false
      }));
    } catch (e) {
      return [];
    }
  }

  async getRelatedTracks(track) {
    if (!track) return [];
    const query = `${track.artist} hits`;
    const results = await this.searchGlobalTracks(query);
    return results.filter(t => t.id !== track.id && t.title !== track.title).slice(0, 8);
  }

  async searchGlobalTracks(query) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return [];
    const key = q.toLowerCase();
    if (this._searchCache.has(key)) return this._searchCache.get(key) || [];

    try {
      const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30`;
      const res = await this._fetch(url, 3500);
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).map(r => ({
          id: `online_${r.trackId}`,
          trackId: r.trackId,
          title: r.trackName,
          artist: r.artistName || 'Artista Desconocido',
          album: r.collectionName || 'Single',
          duration: Math.round((r.trackTimeMillis || 0) / 1000),
          cover: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : null,
          previewUrl: r.previewUrl || '',
          path: r.previewUrl || '',
          isOnline: true,
          isOffline: false
        }));
        if (results.length > 0) {
          this._searchCache.set(key, results);
          return results;
        }
      }
    } catch (e) {}

    const invidResults = await this._searchInvidiousFallback(q);
    this._searchCache.set(key, invidResults);
    return invidResults;
  }

  async _searchInvidiousFallback(query) {
    for (let i = 0; i < INVIDIOUS_HOSTS.length; i++) {
      const host = INVIDIOUS_HOSTS[(this._hostIdx + i) % INVIDIOUS_HOSTS.length];
      try {
        const res = await this._fetch(`${host}/api/v1/search?q=${encodeURIComponent(query + ' audio')}&type=video`, TIMEOUT_MS);
        if (!res.ok) continue;
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          this._hostIdx = (this._hostIdx + i) % INVIDIOUS_HOSTS.length;
          return items.slice(0, 25).map(item => ({
            id: `online_${item.videoId}`,
            videoId: item.videoId,
            title: item.title,
            artist: item.author || 'Artista Desconocido',
            album: 'YouTube Music',
            duration: item.lengthSeconds || 0,
            cover: item.videoThumbnails?.[0]?.url || null,
            previewUrl: '',
            path: '',
            isOnline: true,
            isOffline: false
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  async getAudioStreamUrl(track) {
    if (!track) return '';
    const cacheKey = track.videoId || track.id || track.path;
    if (this._streamCache.has(cacheKey)) return this._streamCache.get(cacheKey) || '';

    // Nivel 1: IPC Nativo en Electron (Directo, sin CORS)
    try {
      const ipcRes = await platform.getYoutubeStream({ artist: track.artist, title: track.title, query: track.videoId ? undefined : `${track.artist} - ${track.title}` });
      if (ipcRes?.url) {
        this._streamCache.set(cacheKey, ipcRes.url);
        return ipcRes.url;
      }
    } catch (e) {}

    // Nivel 2: Invidious Multi-Instancia (Web / Android)
    const invidStream = await this._resolveInvidiousStream(track);
    if (invidStream) {
      this._streamCache.set(cacheKey, invidStream);
      return invidStream;
    }

    // Nivel 3: Audius Stream o iTunes Preview Garantizado
    if (track.audiusId) {
      const audiusUrl = `https://discoveryprovider.audius.co/v1/tracks/${track.audiusId}/stream?app_name=AuraMusicPlayer`;
      this._streamCache.set(cacheKey, audiusUrl);
      return audiusUrl;
    }

    const fallback = track.previewUrl || (track.path?.startsWith('http') ? track.path : '');
    if (fallback) this._streamCache.set(cacheKey, fallback);
    return fallback;
  }

  async _resolveInvidiousStream(track) {
    let vid = track.videoId;
    if (!vid && track.artist && track.title) {
      vid = await this._searchVideoId(track.artist, track.title);
      if (vid) track.videoId = vid;
    }
    if (!vid) return null;

    for (const host of INVIDIOUS_HOSTS) {
      try {
        const res = await this._fetch(`${host}/api/v1/videos/${vid}`, TIMEOUT_MS);
        if (!res.ok) continue;
        const data = await res.json();
        const audios = (data.adaptiveFormats || []).filter(f => f.type && f.type.includes('audio'));
        if (audios.length > 0) {
          audios.sort((a, b) => parseInt(b.bitrate || '0', 10) - parseInt(a.bitrate || '0', 10));
          if (audios[0]?.url) return audios[0].url;
        }
      } catch (e) {}
    }
    return null;
  }

  async _searchVideoId(artist, title) {
    const q = `${artist} ${title} official audio`;
    for (const host of INVIDIOUS_HOSTS) {
      try {
        const res = await this._fetch(`${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, TIMEOUT_MS);
        if (!res.ok) continue;
        const items = await res.json();
        if (items?.[0]?.videoId) return items[0].videoId;
      } catch (e) {}
    }
    return null;
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
