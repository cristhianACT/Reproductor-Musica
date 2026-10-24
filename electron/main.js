import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, globalShortcut, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { parseFile, selectCover } from 'music-metadata';

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
