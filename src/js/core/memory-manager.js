// Gestor de ciclo de vida de memoria y Object URLs para Aura Music Player

class MemoryManager {
  constructor() {
    this._objectUrls = new Set();
  }

  /**
   * Crea una URL temporal para un Blob/File y la registra para revocación controlada
   * @param {Blob|File} blob 
   * @returns {string} Object URL
   */
  createTrackUrl(blob) {
    if (!blob) return '';
    try {
      const url = URL.createObjectURL(blob);
      this._objectUrls.add(url);
      return url;
    } catch (err) {
      console.warn('Error al crear ObjectURL:', err);
      return '';
    }
  }

  /**
   * Revoca una URL específica liberando memoria de inmediato
   * @param {string} url 
   */
  revokeUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (this._objectUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignorar si ya fue liberada
      }
      this._objectUrls.delete(url);
    }
  }

  /**
   * Libera todas las URLs binarias registradas
   */
  revokeAll() {
    for (const url of this._objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignorar
      }
    }
    this._objectUrls.clear();
  }

  /**
   * Limpia datos redundantes o imágenes Base64 masivas antes de persistir en LocalStorage
   * para no exceder cuotas de memoria ni saturar el Garbage Collector
   * @param {Array<any>} tracks 
   * @returns {Array<any>} Tracks saneados
   */
  sanitizeTracksForStorage(tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks.map(track => {
      let cover = track.cover;
      // Si la imagen es un Base64 de más de 80 KB, la descartamos de la persistencia para no saturar memoria
      if (typeof cover === 'string' && cover.startsWith('data:') && cover.length > 80 * 1024) {
        cover = null;
      }
      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        path: track.path,
        fileName: track.fileName,
        cover: cover
      };
    });
  }
}

export const memoryManager = new MemoryManager();
