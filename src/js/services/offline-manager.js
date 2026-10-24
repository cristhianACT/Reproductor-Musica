// Gestor de Descargas Offline y Persistencia Híbrida Multiplataforma (IndexedDB + Electron Disk)
import { platform } from '../core/platform-bridge.js';
import { streamingService } from './streaming-service.js';

const DB_NAME = 'AuraOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_audio_blobs';

class OfflineManager extends EventTarget {
  constructor() {
    super();
    /** @type {IDBDatabase|null} */
    this._db = null;
    /** @type {Map<string, any>} */
    this._offlineTracksMap = new Map();
    /** @type {Map<string, string>} */
    this._activeBlobUrls = new Map();
    this._isReady = false;
  }

  async init() {
    if (this._isReady) return;
    try {
      this._db = await new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          // @ts-ignore
          if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
            // @ts-ignore
            e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const records = await this._idbOp('readonly', s => s.getAll()) || [];
      records.forEach(r => this._offlineTracksMap.set(r.id, { ...r, blob: undefined }));
      this._isReady = true;
    } catch (err) {
      console.warn('Error inicializando IndexedDB OfflineManager:', err);
    }
  }

  isOffline(trackId) { return this._offlineTracksMap.has(trackId); }
  getOfflineTrack(trackId) { return this._offlineTracksMap.get(trackId) || null; }
  getAllOfflineTracks() { return Array.from(this._offlineTracksMap.values()); }
  getTotalStorageUsage() {
    const totalBytes = Array.from(this._offlineTracksMap.values()).reduce((acc, t) => acc + (t.size || 0), 0);
    if (totalBytes <= 0) return '0 MB';
    const mb = totalBytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
  }

  async getOfflineAudioUrl(trackId) {
    const track = this._offlineTracksMap.get(trackId);
    if (!track) return '';
    if (track.path && !track.path.startsWith('blob:') && !track.path.startsWith('http')) {
      return platform.getAudioStreamUrl(track);
    }
    if (this._activeBlobUrls.has(trackId)) return this._activeBlobUrls.get(trackId) || '';
    try {
      const record = await this._idbOp('readonly', s => s.get(trackId));
      if (record?.blob) {
        const blobUrl = URL.createObjectURL(record.blob);
        this._activeBlobUrls.set(trackId, blobUrl);
        return blobUrl;
      }
    } catch (e) {
      console.warn('Error extrayendo Blob audio offline:', e);
    }
    return track.path || '';
  }

  async downloadTrackForOffline(track, onProgress) {
    if (!track || this.isOffline(track.id)) return this.getOfflineTrack(track.id);
    track.isDownloading = true;
    track.downloadPercent = 0;
    this.dispatchEvent(new CustomEvent('download:started', { detail: { trackId: track.id } }));

    try {
      const streamUrl = await streamingService.getAudioStreamUrl(track);
      if (!streamUrl) throw new Error('No se pudo resolver URL de audio');

      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} al descargar stream`);

      const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream no disponible');

      const chunks = [];
      let receivedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        if (totalBytes > 0 && onProgress) {
          const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
          track.downloadPercent = percent;
          onProgress(percent);
          this.dispatchEvent(new CustomEvent('download:progress', { detail: { trackId: track.id, percent } }));
        }
      }

      const mimeType = streamUrl.includes('.webm') ? 'audio/webm' : 'audio/mp4';
      const audioBlob = new Blob(chunks, { type: mimeType });
      chunks.length = 0; // Liberar chunks inmediatamente para no saturar 1 GB de RAM

      const ext = mimeType.includes('webm') ? 'webm' : 'm4a';
      const cleanTitle = (track.title || 'cancion').replace(/[/\\?%*:|"<>]/g, '_');
      const cleanArtist = (track.artist || 'artista').replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `${cleanArtist} - ${cleanTitle}.${ext}`;
      let localPath = '';

      if (platform.isElectron) {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const saveRes = await platform.saveDownloadedTrack({
          fileName,
          buffer: arrayBuffer,
          metadata: { title: track.title, artist: track.artist, album: track.album, duration: track.duration }
        });
        if (saveRes?.filePath) localPath = saveRes.filePath;
      }

      const offlineTrack = {
        id: track.id,
        videoId: track.videoId || null,
        title: track.title,
        artist: track.artist,
        album: track.album || 'Descargas Offline',
        duration: track.duration || 0,
        cover: track.cover || null,
        path: localPath || fileName,
        fileName,
        isOnline: false,
        isOffline: true,
        downloadedAt: Date.now(),
        size: receivedBytes
      };

      await this._idbOp('readwrite', s => s.put({ ...offlineTrack, blob: platform.isElectron ? null : audioBlob }));
      this._offlineTracksMap.set(track.id, offlineTrack);
      track.isOffline = true;
      track.isDownloading = false;
      track.downloadPercent = 100;
      this.dispatchEvent(new CustomEvent('download:completed', { detail: { track: offlineTrack } }));
      return offlineTrack;
    } catch (err) {
      track.isDownloading = false;
      this.dispatchEvent(new CustomEvent('download:error', { detail: { trackId: track.id, error: err } }));
      throw err;
    }
  }

  async deleteOfflineTrack(trackId) {
    const track = this._offlineTracksMap.get(trackId);
    if (!track) return;
    if (platform.isElectron && track.path) await platform.deleteDownloadedTrack(track.path);
    if (this._activeBlobUrls.has(trackId)) {
      URL.revokeObjectURL(this._activeBlobUrls.get(trackId) || '');
      this._activeBlobUrls.delete(trackId);
    }
    await this._idbOp('readwrite', s => s.delete(trackId));
    this._offlineTracksMap.delete(trackId);
    this.dispatchEvent(new CustomEvent('download:deleted', { detail: { trackId } }));
  }

  _idbOp(mode, op) {
    return new Promise((resolve, reject) => {
      if (!this._db) return resolve(null);
      const tx = this._db.transaction(STORE_NAME, mode);
      const req = op(tx.objectStore(STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineManager = new OfflineManager();
