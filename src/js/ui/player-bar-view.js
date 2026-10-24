// Vista de la Barra de Reproducción Inferior y Vista Expandida Móvil
import { DOM } from './dom-elements.js';
import { formatTime } from '../utils/formatters.js';
import { Storage } from '../storage.js';

export function updateNowPlayingBar(track) {
  const art = DOM.player.nowPlayingArt;
  const title = DOM.player.nowPlayingTitle;
  const artist = DOM.player.nowPlayingArtist;
  const favBtn = DOM.player.nowPlayingFavBtn;
  const titlebarTitle = DOM.titlebar.trackTitle;
  const sTitle = DOM.mobileSheet.title;
  const sArtist = DOM.mobileSheet.artist;
  const sArt = DOM.mobileSheet.art;
  const sFav = DOM.mobileSheet.favBtn;

  if (!track) {
    if (title) title.textContent = 'Ninguna canción';
    if (artist) artist.textContent = 'Selecciona música para reproducir';
    if (sTitle) sTitle.textContent = 'Ninguna canción';
    if (sArtist) sArtist.textContent = 'Selecciona música';
    const defArt = `<div class="default-art"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
    if (art) art.innerHTML = defArt;
    if (sArt) sArt.innerHTML = defArt;
    favBtn?.classList.remove('is-fav');
    sFav?.classList.remove('is-fav');
    if (titlebarTitle) titlebarTitle.textContent = 'Aura Desktop Audio';
    return;
  }

  const trackTitle = track.title || track.fileName;
  const trackArtist = track.artist || 'Artista desconocido';
  if (title) title.textContent = trackTitle;
  if (artist) artist.textContent = trackArtist;
  if (sTitle) sTitle.textContent = trackTitle;
  if (sArtist) sArtist.textContent = trackArtist;
  if (titlebarTitle) titlebarTitle.textContent = `${trackTitle} • ${trackArtist}`;

  const artHtml = track.cover 
    ? `<img src="${track.cover}" alt="Cover">`
    : `<div class="default-art"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
  if (art) art.innerHTML = artHtml;
  if (sArt) sArt.innerHTML = artHtml;

  const isFav = Storage.isFavorite(track.id);
  favBtn?.classList.toggle('is-fav', isFav);
  sFav?.classList.toggle('is-fav', isFav);
}

export function updatePlayingRow(currentTrack, isPlaying) {
  const rows = document.querySelectorAll('.track-row');
  rows.forEach(row => {
    const trackId = row.getAttribute('data-track-id');
    const isThisTrack = currentTrack && currentTrack.id === trackId;
    row.classList.toggle('active', isThisTrack);
    row.classList.toggle('is-playing', isThisTrack && isPlaying);

    const playIcon = row.querySelector('.track-play-icon');
    if (playIcon) {
      playIcon.innerHTML = isThisTrack && isPlaying
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }
  });
}

export function updatePlayPauseButton(isPlaying) {
  const icons = [DOM.player.playPauseIcon, DOM.mobileSheet.playPauseIcon];
  const btns = [DOM.player.playPauseBtn, DOM.mobileSheet.playPauseBtn];
  const svgContent = isPlaying 
    ? `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`
    : `<polygon points="5 3 19 12 5 21 5 3"/>`;

  icons.forEach(ic => { if (ic) ic.innerHTML = svgContent; });
  btns.forEach(b => {
    if (b) {
      b.classList.toggle('playing', isPlaying);
      b.title = isPlaying ? 'Pausar' : 'Reproducir';
    }
  });
}

export function updatePlaybackProgress(currentTime, duration, isDragging = false) {
  if (isDragging) return;
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  if (DOM.player.progressBarFill) DOM.player.progressBarFill.style.width = `${percent}%`;
  if (DOM.player.progressBarThumb) DOM.player.progressBarThumb.style.left = `${percent}%`;
  if (DOM.mobileSheet.progressBarFill) DOM.mobileSheet.progressBarFill.style.width = `${percent}%`;

  const timeStr = formatTime(currentTime);
  const totalStr = duration > 0 ? formatTime(duration) : '0:00';
  if (DOM.player.currentTimeLabel) DOM.player.currentTimeLabel.textContent = timeStr;
  if (DOM.player.totalTimeLabel) DOM.player.totalTimeLabel.textContent = totalStr;
  if (DOM.mobileSheet.currentTimeLabel) DOM.mobileSheet.currentTimeLabel.textContent = timeStr;
  if (DOM.mobileSheet.totalTimeLabel) DOM.mobileSheet.totalTimeLabel.textContent = totalStr;
}

export function updateProgressVisual(percent, realDuration) {
  if (DOM.player.progressBarFill) DOM.player.progressBarFill.style.width = `${percent * 100}%`;
  if (DOM.player.progressBarThumb) DOM.player.progressBarThumb.style.left = `${percent * 100}%`;
  if (DOM.mobileSheet.progressBarFill) DOM.mobileSheet.progressBarFill.style.width = `${percent * 100}%`;

  if (realDuration > 0) {
    const curStr = formatTime(percent * realDuration);
    if (DOM.player.currentTimeLabel) DOM.player.currentTimeLabel.textContent = curStr;
    if (DOM.mobileSheet.currentTimeLabel) DOM.mobileSheet.currentTimeLabel.textContent = curStr;
  }
}

export function toggleMobileSheet(open) {
  const sheet = DOM.mobileSheet.sheet;
  if (!sheet) return;
  const shouldOpen = typeof open === 'boolean' ? open : !sheet.classList.contains('active');
  sheet.classList.toggle('active', shouldOpen);
}

export function updateVolumeUI(vol) {
  const fill = DOM.player.volumeBarFill;
  const thumb = DOM.player.volumeBarThumb;
  const volIcon = DOM.player.volumeIcon;

  if (fill) fill.style.width = `${vol * 100}%`;
  if (thumb) thumb.style.left = `${vol * 100}%`;

  if (!volIcon) return;
  if (vol === 0) {
    volIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
  } else if (vol < 0.5) {
    volIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
  } else {
    volIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
  }
}

export function updateWindowState({ isMaximized, isMini }) {
  document.body.classList.toggle('mini-mode', !!isMini);
  const maxIcon = DOM.titlebar.maxIcon;
  if (maxIcon) {
    maxIcon.innerHTML = isMaximized
      ? `<rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke-width="2"/><path d="M9 4h7a2 2 0 0 1 2 2v7" fill="none" stroke-width="2"/>`
      : `<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke-width="2"/>`;
  }
}
