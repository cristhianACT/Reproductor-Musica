import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, globalShortcut, Notification, session } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { parseFile, selectCover } from 'music-metadata';
import ytSearch from 'yt-search';
import { Ytdl } from '@distube/ytdl-core';

const ytdl = new Ytdl();
const streamUrlCache = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registrar el esquema privilegiado para streaming de audio local seguro y con soporte de seek
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
]);

// Prevenir múltiples instancias simultáneas y bloqueos de caché SQLite/disk_cache en Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Desactivar flags de shader disk cache que provocan error Acceso Denegado (0x5) en Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow = null;
let isMiniPlayer = false;
let normalBounds = { width: 1240, height: 820, x: undefined, y: undefined };

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma']);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0d11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    if (!isMiniPlayer) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: true, isMini: false });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (!isMiniPlayer) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: false, isMini: false });
    }
  });
}

// Configuración de protocolo y ciclo de vida de la app
app.whenReady().then(() => {
  // Configuración de CORS y cabeceras para streaming sin restricciones (YouTube Music, Piped, Invidious, Apple, Deezer)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = details.requestHeaders || {};
    if (details.url.startsWith('http:') || details.url.startsWith('https:')) {
      delete requestHeaders['Origin'];
      delete requestHeaders['Referer'];
    }
    callback({ requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders['access-control-allow-origin'] = ['*'];
    responseHeaders['access-control-allow-methods'] = ['GET, HEAD, POST, OPTIONS, PUT, DELETE'];
    responseHeaders['access-control-allow-headers'] = ['*'];
    callback({ responseHeaders });
  });

  // Manejador del protocolo local-audio con soporte nativo de HTTP 206 Range Requests para seek instantáneo
  protocol.handle('local-audio', async (request) => {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          }
        });
      }

      const url = new URL(request.url);
      let targetPath = url.searchParams.get('path');

      if (!targetPath) {
        let rawPath = request.url.replace(/^local-audio:\/\/(stream\/?)?/, '');
        targetPath = decodeURIComponent(rawPath);
      }

      if (!fs.existsSync(targetPath)) {
        return new Response('File not found', {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      const stat = fs.statSync(targetPath);
      const fileSize = stat.size;
      const ext = path.extname(targetPath).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.opus': 'audio/ogg',
        '.wma': 'audio/x-ms-wma'
      };
      const contentType = mimeTypes[ext] || 'audio/mpeg';

      const rangeHeader = request.headers.get('range');

      // Si la petición solicita un rango de bytes (cuando el usuario adelanta o retrasa la canción)
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

          if (start < fileSize) {
            const chunkSize = (end - start) + 1;
            const nodeStream = fs.createReadStream(targetPath, { start, end });
            const webStream = Readable.toWeb(nodeStream);

            return new Response(webStream, {
              status: 206,
              statusText: 'Partial Content',
              headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(chunkSize),
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': '*'
              }
            });
          }
        }
      }

      // Solicitud normal completa
      const nodeStream = fs.createReadStream(targetPath);
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    } catch (err) {
      console.error('Error handling local-audio protocol:', err);
      return new Response('Internal error', {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  });

  createWindow();

  // Registrar atajos multimedia de teclado globales de Windows
  try {
    globalShortcut.register('MediaPlayPause', () => {
      mainWindow?.webContents.send('media-key:toggle');
    });
    globalShortcut.register('MediaNextTrack', () => {
      mainWindow?.webContents.send('media-key:next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      mainWindow?.webContents.send('media-key:prev');
    });
  } catch (err) {
    console.warn('No se pudieron registrar algunas teclas multimedia globales:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Controles de ventana frameless
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// Modo Mini-Player flotante de escritorio
ipcMain.handle('window:toggleMiniPlayer', () => {
  if (!mainWindow) return false;

  isMiniPlayer = !isMiniPlayer;

  if (isMiniPlayer) {
    normalBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(320, 160);
    mainWindow.setSize(380, 185);
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setResizable(false);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(920, 600);
    mainWindow.setSize(normalBounds.width || 1240, normalBounds.height || 820);
    if (normalBounds.x !== undefined && normalBounds.y !== undefined) {
      mainWindow.setPosition(normalBounds.x, normalBounds.y);
    }
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.webContents.send('window:state-changed', {
    isMaximized: mainWindow.isMaximized(),
    isMini: isMiniPlayer
  });

  return isMiniPlayer;
});

// Notificaciones nativas de escritorio
ipcMain.handle('app:notifyTrack', (_event, { title, artist }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Reproduciendo',
      body: artist || 'Aura Music Player',
      silent: true
    }).show();
  }
});

// Abrir en el explorador de archivos nativo de Windows
ipcMain.handle('shell:showItemInFolder', (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Diálogos nativos del sistema
ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de música'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:openFiles', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Archivos de audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'wma'] }
    ],
    title: 'Seleccionar archivos de música'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

ipcMain.handle('music:getDefaultMusicDir', () => {
  try {
    return app.getPath('music');
  } catch {
    return null;
  }
});

// ==========================================
// Gestor de Descargas Offline en Disco
// ==========================================
function getAuraDownloadsDir() {
  const musicDir = app.getPath('music') || app.getPath('userData');
  const dir = path.join(musicDir, 'Aura Downloads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

ipcMain.handle('offline:getDownloadsDir', () => {
  return getAuraDownloadsDir();
});

ipcMain.handle('offline:saveTrack', async (_event, { fileName, buffer, metadata }) => {
  try {
    const dir = getAuraDownloadsDir();
    const safeName = (fileName || 'track.m4a').replace(/[/\\?%*:|"<>]/g, '_');
    const targetPath = path.join(dir, safeName);
    fs.writeFileSync(targetPath, Buffer.from(buffer));

    let track = null;
    try {
      track = await extractMetadata(targetPath);
    } catch {
      track = {
        id: Buffer.from(targetPath).toString('base64url'),
        path: targetPath,
        fileName: safeName,
        title: metadata?.title || path.basename(safeName, path.extname(safeName)),
        artist: metadata?.artist || 'Artista Desconocido',
        album: metadata?.album || 'Aura Downloads',
        duration: metadata?.duration || 0,
        cover: null
      };
    }
    return { success: true, filePath: targetPath, track };
  } catch (err) {
    console.error('Error guardando pista offline:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('offline:deleteTrack', async (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error eliminando pista offline:', err);
    return false;
  }
});

// Función auxiliar para extraer metadatos de un archivo
async function extractMetadata(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fileStats = fs.statSync(filePath);

  let title = path.basename(filePath, ext);
  let artist = 'Artista desconocido';
  let album = 'Álbum desconocido';
  let duration = 0;
  let year = null;
  let genre = null;
  let coverData = null;

  try {
    const metadata = await parseFile(filePath, { skipCovers: false });
    if (metadata.common) {
      if (metadata.common.title) title = metadata.common.title.trim();
      if (metadata.common.artist) artist = metadata.common.artist.trim();
      if (metadata.common.album) album = metadata.common.album.trim();
      if (metadata.common.year) year = metadata.common.year;
      if (metadata.common.genre && metadata.common.genre.length > 0) {
        genre = metadata.common.genre.join(', ');
      }

      const cover = selectCover(metadata.common.picture);
      if (cover && cover.data && cover.format) {
        coverData = `data:${cover.format};base64,${cover.data.toString('base64')}`;
      }
    }

    if (metadata.format && metadata.format.duration) {
      duration = Math.round(metadata.format.duration);
    }
  } catch (err) {
    console.warn(`No se pudieron extraer tags completos para ${fileName}:`, err.message);
  }

  const id = Buffer.from(filePath).toString('base64url');

  return {
    id,
    path: filePath,
    fileName,
    title,
    artist,
    album,
    duration,
    year,
    genre,
    cover: coverData,
    size: fileStats.size,
    modifiedAt: fileStats.mtimeMs
  };
}

// Recorrer directorios recursivamente
function getAudioFilesRecursively(dirPath, maxDepth = 6, currentDepth = 0) {
  let results = [];
  if (currentDepth > maxDepth) return results;

  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of list) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '$RECYCLE.BIN') {
        continue;
      }
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        results = results.concat(getAudioFilesRecursively(fullPath, maxDepth, currentDepth + 1));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.warn(`Error leyendo directorio ${dirPath}:`, err.message);
  }
  return results;
}

ipcMain.handle('music:scanFolder', async (_event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  const filePaths = getAudioFilesRecursively(folderPath);

  const tracks = [];
  for (const filePath of filePaths) {
    try {
      const track = await extractMetadata(filePath);
      tracks.push(track);
    } catch (e) {
      console.error(`Error procesando archivo ${filePath}:`, e);
    }
  }
  return tracks;
});

ipcMain.handle('music:parseFiles', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return [];
  const tracks = [];
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const track = await extractMetadata(filePath);
        tracks.push(track);
      }
    } catch (e) {
      console.error(`Error procesando archivo ${filePath}:`, e);
    }
  }
  return tracks;
});

ipcMain.handle('music:getSampleMusic', async () => {
  const sampleDir = path.join(__dirname, '../sample_music');
  if (!fs.existsSync(sampleDir)) return [];
  const filePaths = getAudioFilesRecursively(sampleDir);
  const tracks = [];
  for (const filePath of filePaths) {
    try {
      const track = await extractMetadata(filePath);
      tracks.push(track);
    } catch (e) {
      console.error(`Error procesando archivo de muestra ${filePath}:`, e);
    }
  }
  return tracks;
});

// Respaldo de Catálogo: Deezer Public API (Cero API Keys)
ipcMain.handle('music:searchDeezer', async (_event, query) => {
  if (!query) return [];
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=30`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(d => ({
      id: `deezer_${d.id}`,
      title: d.title,
      artist: d.artist?.name || 'Artista Desconocido',
      album: d.album?.title || 'Deezer',
      duration: d.duration || 180,
      cover: d.album?.cover_xl || d.album?.cover_big || d.album?.cover_medium || null,
      previewUrl: d.preview || '',
      path: d.preview || '',
      isOnline: true,
      isOffline: false
    }));
  } catch (err) {
    return [];
  }
});

// Nivel 1: Extractor de audio libre nativo en Electron (Cero API Keys, <800ms)
ipcMain.handle('get-youtube-stream', async (_event, { artist, title, query }) => {
  let cleanTitle = (title || '')
    .replace(/\s*[\(\[](?:(?:\d{4}\s+)?remaster(?:ed)?|remaster(?:ed)?(?:\s+\d{4})?|official\s*(?:video|audio|music\s*video)?|deluxe|explicit|radio\s*edit|bonus\s*track|version|anniversary|expanded)[\)\]]/gi, '')
    .replace(/\s*-\s*(?:remaster(?:ed)?(?:\s*\d{4})?|live|single|ep\s*version).*$/gi, '')
    .trim();
  const cleanArtist = (artist || '').replace(/\s*-\s*topic$/i, '').trim();
  const searchTerm = query || `${cleanArtist} ${cleanTitle} audio`.trim();
  if (!searchTerm) return null;

  const cacheKey = searchTerm.toLowerCase();
  const cached = streamUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { url: cached.url, format: cached.format, videoId: cached.videoId };
  }

  let vid = null;
  try {
    const searchRes = await ytSearch(searchTerm);
    if (searchRes?.videos?.length > 0) {
      vid = searchRes.videos[0].videoId;
    }
  } catch (e) {
    console.warn('yt-search error:', e.message);
  }

  if (!vid && cleanTitle) {
    try {
      const fallbackSearch = await ytSearch(`${cleanTitle} audio`);
      if (fallbackSearch?.videos?.length > 0) {
        vid = fallbackSearch.videos[0].videoId;
      }
    } catch (e) {}
  }

  if (!vid) return null;

  try {
    const info = await ytdl.getInfo(vid);
    const audios = (info.formats || []).filter(f => f.hasAudio && !f.hasVideo);
    if (audios.length > 0) {
      audios.sort((a, b) => (b.audioBitrate || b.bitrate || 0) - (a.audioBitrate || a.bitrate || 0));
      const best = audios[0];
      const result = {
        url: best.url,
        format: best.mimeType || 'audio/mp4',
        videoId: vid
      };
      streamUrlCache.set(cacheKey, {
        ...result,
        expiresAt: Date.now() + 4 * 60 * 60 * 1000
      });
      return result;
    }
  } catch (err) {
    console.warn('ytdl error extrayendo stream:', err.message);
  }

  return null;
});

