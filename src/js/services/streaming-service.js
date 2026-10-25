// Servicio de Catálogo Comercial (iTunes+Deezer+Audius) y Extractor Libre (<250 líneas)
import { platform } from '../core/platform-bridge.js';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const ITUNES_CHARTS_PE = 'https://itunes.apple.com/pe/rss/topsongs/limit=25/json';
const ITUNES_CHARTS_US = 'https://itunes.apple.com/us/rss/topsongs/limit=25/json';
const AUDIUS_TRENDING = 'https://discoveryprovider.audius.co/v1/tracks/trending?app_name=AuraMusicPlayer&limit=15';
const STREAM_MIRRORS = [
  'https://yt.chocolatemoo53.com', 'https://inv.nadeko.net', 'https://invidious.tiekoetter.com',
  'https://invidious.nerdvpn.de', 'https://pipedapi.kavin.rocks', 'https://pipedapi.tokhmi.xyz'
];
const TIMEOUT_MS = 2500;
const MOODS = {
  'Todo': 'Top Hits Worldwide', 'Energía': 'Electronic Dance Party Hits', 'Relax': 'Acoustic Lo-Fi Chill',
  'Concentración': 'Ambient Study Piano Focus', 'Entrenamiento': 'Workout Fitness Motivation',
  'Romance': 'Romantic Love Songs Ballads', 'Fiesta': 'Latin Pop Reggaeton Hits'
};

class StreamingService {
  constructor() {
    this._searchCache = new Map(); this._streamCache = new Map();
    this._homeCache = new Map(); this._hostIdx = 0;
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
    for (const url of [ITUNES_CHARTS_PE, ITUNES_CHARTS_US]) {
      try {
        const res = await this._fetch(url, 2800);
        if (!res.ok) continue;
        const data = await res.json();
        const list = (data.feed?.entry || []).map(e => ({
          id: `itunes_chart_${e.id?.attributes?.['im:id'] || Math.random().toString(36).substr(2, 6)}`,
          title: e['im:name']?.label || 'Canción', artist: e['im:artist']?.label || 'Artista',
          album: e['im:collection']?.['im:name']?.label || 'Top Hit', duration: 210,
          cover: (e['im:image']?.[2]?.label || '').replace('170x170bb', '600x600bb'),
          previewUrl: e.link?.[1]?.attributes?.href || '', isOnline: true, isOffline: false
        }));
        if (list.length > 0) return list;
      } catch (e) {}
    }
    return this._getAudiusTrending();
  }

  async _getAudiusTrending() {
    try {
      const res = await this._fetch(AUDIUS_TRENDING, 3000);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map(t => ({
        id: `audius_${t.id}`, audiusId: t.id, title: t.title, artist: t.user?.name || 'Artista Audius',
        album: 'Audius Trending', duration: t.duration || 180, cover: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
        previewUrl: `https://discoveryprovider.audius.co/v1/tracks/${t.id}/stream?app_name=AuraMusicPlayer`, isOnline: true, isOffline: false
      }));
    } catch (e) { return []; }
  }

  async getRelatedTracks(track) {
    if (!track) return [];
    const results = await this.searchGlobalTracks(`${track.artist} hits`);
    return results.filter(t => t.id !== track.id && t.title !== track.title).slice(0, 8);
  }

  async searchGlobalTracks(query) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return [];
    const key = `t_${q.toLowerCase()}`;
    if (this._searchCache.has(key)) return this._searchCache.get(key) || [];

    try {
      const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(q)}&media=music&entity=song&limit=50`;
      const res = await this._fetch(url, 3200);
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).map(r => ({
          id: `online_${r.trackId}`, trackId: r.trackId, title: r.trackName,
          artist: r.artistName || 'Artista Desconocido', album: r.collectionName || 'Single',
          duration: Math.round((r.trackTimeMillis || 0) / 1000),
          cover: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : null,
          previewUrl: r.previewUrl || '', path: r.previewUrl || '', isOnline: true, isOffline: false
        }));
        if (results.length > 0) { this._searchCache.set(key, results); return results; }
      }
    } catch (e) {}

    try {
      const dzResults = await platform.searchDeezer(q);
      if (dzResults?.length > 0) { this._searchCache.set(key, dzResults); return dzResults; }
    } catch (e) {}

    const invidResults = await this._searchMirrorFallback(q);
    this._searchCache.set(key, invidResults);
    return invidResults;
  }

  async searchGlobalAlbums(query) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return [];
    const key = `a_${q.toLowerCase()}`;
    if (this._searchCache.has(key)) return this._searchCache.get(key) || [];

    try {
      const url = `${ITUNES_SEARCH}?term=${encodeURIComponent(q)}&media=music&entity=album&limit=25`;
      const res = await this._fetch(url, 3200);
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).map(a => ({
          id: `album_${a.collectionId}`, collectionId: a.collectionId, title: a.collectionName,
          artist: a.artistName || 'Artista', cover: (a.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
          trackCount: a.trackCount || 0, year: a.releaseDate ? a.releaseDate.substring(0, 4) : '',
          genre: a.primaryGenreName || 'Álbum', isOnline: true
        }));
        this._searchCache.set(key, results);
        return results;
      }
    } catch (e) {}
    return [];
  }

  async getAlbumTracks(collectionId) {
    if (!collectionId) return [];
    try {
      const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=100`;
      const res = await this._fetch(url, 3500);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).filter(r => r.wrapperType === 'track').map(t => ({
        id: `online_${t.trackId}`, trackId: t.trackId, title: t.trackName,
        artist: t.artistName || 'Artista', album: t.collectionName || 'Álbum',
        trackNumber: t.trackNumber || 1, duration: Math.round((t.trackTimeMillis || 0) / 1000),
        cover: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        previewUrl: t.previewUrl || '', path: t.previewUrl || '', isOnline: true, isOffline: false
      })).sort((a, b) => a.trackNumber - b.trackNumber);
    } catch (e) { return []; }
  }

  async searchCatalog(query) {
    const [tracks, albums] = await Promise.all([this.searchGlobalTracks(query), this.searchGlobalAlbums(query)]);
    return { tracks, albums, topResult: tracks[0] || null };
  }

  async _searchMirrorFallback(query) {
    for (let i = 0; i < STREAM_MIRRORS.length; i++) {
      const host = STREAM_MIRRORS[(this._hostIdx + i) % STREAM_MIRRORS.length];
      try {
        const res = await this._fetch(`${host}/api/v1/search?q=${encodeURIComponent(query + ' audio')}&type=video`, TIMEOUT_MS);
        if (!res.ok) continue;
        const items = await res.json();
        if (Array.isArray(items) && items.length > 0) {
          this._hostIdx = (this._hostIdx + i) % STREAM_MIRRORS.length;
          return items.slice(0, 35).map(item => ({
            id: `online_${item.videoId}`, videoId: item.videoId, title: item.title,
            artist: item.author || 'Artista Desconocido', album: 'YouTube Music',
            duration: item.lengthSeconds || 0, cover: item.videoThumbnails?.[0]?.url || null,
            previewUrl: '', path: '', isOnline: true, isOffline: false
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  async getAudioStreamUrl(track) {
    if (!track) return '';
    const cacheKey = track.videoId || track.id || `${track.artist}_${track.title}`;
    if (this._streamCache.has(cacheKey)) return this._streamCache.get(cacheKey) || '';

    if (platform.isElectron) {
      try {
        const q = track.videoId ? undefined : `${track.artist} ${track.title}`;
        const ipcRes = await platform.getYoutubeStream({ artist: track.artist, title: track.title, query: q });
        if (ipcRes?.url) {
          this._streamCache.set(cacheKey, ipcRes.url);
          return ipcRes.url;
        }
      } catch (e) {}
    }

    if (track.audiusId) {
      const u = `https://discoveryprovider.audius.co/v1/tracks/${track.audiusId}/stream?app_name=AuraMusicPlayer`;
      this._streamCache.set(cacheKey, u);
      return u;
    }

    if (!platform.isElectron) {
      const mirrorStream = await this._resolveMirrorStream(track);
      if (mirrorStream) {
        this._streamCache.set(cacheKey, mirrorStream);
        return mirrorStream;
      }
    }

    return '';
  }

  async _resolveMirrorStream(track) {
    let vid = track.videoId || (track.artist && track.title ? await this._searchVideoId(track.artist, track.title) : null);
    if (!vid) return null;
    track.videoId = vid;
    for (const host of STREAM_MIRRORS) {
      try {
        const res = await this._fetch(`${host}/api/v1/videos/${vid}`, TIMEOUT_MS);
        if (!res.ok) continue;
        const data = await res.json();
        const audios = (data.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
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
    for (const host of STREAM_MIRRORS) {
      try {
        const res = await this._fetch(`${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, TIMEOUT_MS);
        if (res.ok) { const items = await res.json(); if (items?.[0]?.videoId) return items[0].videoId; }
      } catch (e) {}
    }
    return null;
  }

  async _fetch(url, timeoutMs) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try { const res = await fetch(url, { signal: ctrl.signal }); clearTimeout(id); return res; }
    catch (e) { clearTimeout(id); throw e; }
  }
}

export const streamingService = new StreamingService();
