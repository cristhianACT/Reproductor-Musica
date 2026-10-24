// Controlador de reproducción de audio y sincronización con Player Bar y MediaSession
import { DOM } from '../ui/dom-elements.js';
import { EQ_PRESETS } from '../audio-engine.js';
import { Storage } from '../storage.js';
import { platform } from '../core/platform-bridge.js';
import { formatTime } from '../utils/formatters.js';
import { 
  updateNowPlayingBar, updatePlayPauseButton, updatePlayingRow, 
  updatePlaybackProgress, updateProgressVisual, updateVolumeUI, toggleMobileSheet 
} from '../ui/player-bar-view.js';
import { renderEqPresets, updateEqSliders, showToast } from '../ui/modals-view.js';

export class PlayerController {
  constructor(audioEngine, state) {
    this.audioEngine = audioEngine;
    this.state = state;
    this.isDraggingProgress = this.isDraggingVolume = false;
    this.pendingSeekPercent = null;
    this.init();
  }

  init() {
    this._initAudioEngineCallbacks();
    this._initMediaSession();
    this._initButtons();
    this._initProgressBar();
    this._initVolumeControl();
    this._initEqualizer();
    this._initGlobalMediaKeys();
    updateVolumeUI(this.audioEngine.isMuted() ? 0 : this.audioEngine.getVolume());
  }

  _initAudioEngineCallbacks() {
    this.audioEngine.onPlayStateChange = (isPlaying) => {
      updatePlayPauseButton(isPlaying);
      updatePlayingRow(this.audioEngine.getCurrentTrack(), isPlaying);
      this.state.emit('playback:state', isPlaying);
      this._updateMediaSessionState(isPlaying);
    };

    this.audioEngine.onTrackChange = (track) => {
      updateNowPlayingBar(track);
      updatePlayingRow(track, this.audioEngine.isPlaying());
      this.state.emit('playback:track', track);
      if (track) {
        platform.notifyTrack({ title: track.title, artist: track.artist });
        this._updateMediaSessionMetadata(track);
      }
    };

    this.audioEngine.onTimeUpdate = (currentTime, duration) => {
      updatePlaybackProgress(currentTime, duration, this.isDraggingProgress);
      this._updateMediaSessionPosition(currentTime, duration);
    };
  }

  _initMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => this.audioEngine.play());
      ms.setActionHandler('pause', () => this.audioEngine.pause());
      ms.setActionHandler('previoustrack', () => this.audioEngine.prev());
      ms.setActionHandler('nexttrack', () => this.audioEngine.next());
      ms.setActionHandler('seekto', (d) => { if (typeof d.seekTime === 'number') this.audioEngine.seekTo(d.seekTime); });
      ms.setActionHandler('seekbackward', (d) => this.audioEngine.seekTo(this.audioEngine.audio.currentTime - (d.seekOffset || 10)));
      ms.setActionHandler('seekforward', (d) => this.audioEngine.seekTo(this.audioEngine.audio.currentTime + (d.seekOffset || 10)));
    } catch (err) {}
  }

  _updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Aura Audio',
        artist: track.artist || 'Aura Player',
        album: track.album || 'Tu Biblioteca',
        artwork: track.cover ? [{ src: track.cover, sizes: '512x512', type: 'image/png' }] : []
      });
    } catch (e) {}
  }

  _updateMediaSessionState(isPlaying) {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'; } catch (e) {}
    }
  }

  _updateMediaSessionPosition(currentTime, duration) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !duration || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration, playbackRate: this.audioEngine.audio.playbackRate || 1.0, position: Math.min(currentTime, duration)
      });
    } catch (e) {}
  }

  _initButtons() {
    DOM.player.playPauseBtn?.addEventListener('click', () => this.audioEngine.togglePlay());
    DOM.player.prevBtn?.addEventListener('click', () => this.audioEngine.prev());
    DOM.player.nextBtn?.addEventListener('click', () => this.audioEngine.next());

    const shuffleBtn = DOM.player.shuffleBtn;
    shuffleBtn?.addEventListener('click', () => {
      const isShuffle = this.audioEngine.toggleShuffle();
      shuffleBtn.classList.toggle('active', isShuffle);
      showToast(isShuffle ? 'Modo aleatorio activado' : 'Modo aleatorio desactivado');
    });
    if (this.audioEngine.isShuffle) shuffleBtn?.classList.add('active');

    const repeatBtn = DOM.player.repeatBtn;
    repeatBtn?.addEventListener('click', () => {
      const mode = this.audioEngine.cycleRepeatMode();
      repeatBtn.classList.remove('active', 'repeat-one');
      if (mode === 'all') { repeatBtn.classList.add('active'); showToast('Repetir todo'); }
      else if (mode === 'one') { repeatBtn.classList.add('active', 'repeat-one'); showToast('Repetir actual'); }
      else showToast('Repetición desactivada');
    });

    DOM.content.playAllBtn?.addEventListener('click', () => {
      const tracks = this.state.getFilteredAndSortedTracks();
      if (tracks.length > 0) this.audioEngine.setQueue(tracks, 0, true);
    });

    DOM.content.shuffleAllBtn?.addEventListener('click', () => {
      const tracks = this.state.getFilteredAndSortedTracks();
      if (!tracks.length) return;
      if (!this.audioEngine.isShuffle) { this.audioEngine.toggleShuffle(); shuffleBtn?.classList.add('active'); }
      this.audioEngine.setQueue(tracks, Math.floor(Math.random() * tracks.length), true);
    });

    const favAction = () => {
      const cur = this.audioEngine.getCurrentTrack();
      if (!cur) return;
      const isFav = Storage.toggleFavorite(cur.id);
      DOM.player.nowPlayingFavBtn?.classList.toggle('is-fav', isFav);
      DOM.mobileSheet.favBtn?.classList.toggle('is-fav', isFav);
      showToast(isFav ? 'Añadida a Favoritos' : 'Eliminada de Favoritos');
      this.state.emit('favorites:changed');
    };
    DOM.player.nowPlayingFavBtn?.addEventListener('click', favAction);
    DOM.mobileSheet.favBtn?.addEventListener('click', favAction);

    DOM.player.nowPlayingArt?.addEventListener('click', () => {
      if (document.body.classList.contains('mini-mode')) {
        const c = this.audioEngine.getCurrentTrack();
        if (c) platform.showItemInFolder(c.path);
        return;
      }
      if (window.innerWidth <= 768 && !platform.isElectron) toggleMobileSheet(true);
      else { const c = this.audioEngine.getCurrentTrack(); if (c) platform.showItemInFolder(c.path); }
    });
    DOM.player.nowPlayingTitle?.addEventListener('click', () => {
      if (document.body.classList.contains('mini-mode')) return;
      if (window.innerWidth <= 768 && !platform.isElectron) toggleMobileSheet(true);
    });
    DOM.player.bar?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.max(0, Math.min(1, this.audioEngine.getVolume() + step));
      this.audioEngine.setVolume(newVol);
      updateVolumeUI(newVol);
    }, { passive: false });
    DOM.mobileSheet.closeBtn?.addEventListener('click', () => toggleMobileSheet(false));
    DOM.mobileSheet.playPauseBtn?.addEventListener('click', () => this.audioEngine.togglePlay());
    DOM.mobileSheet.prevBtn?.addEventListener('click', () => this.audioEngine.prev());
    DOM.mobileSheet.nextBtn?.addEventListener('click', () => this.audioEngine.next());
    DOM.mobileSheet.shuffleBtn?.addEventListener('click', () => shuffleBtn?.click());
    DOM.mobileSheet.repeatBtn?.addEventListener('click', () => repeatBtn?.click());
  }

  _initProgressBar() {
    const pc = DOM.player.progressBarContainer;
    const calc = (cx) => {
      const r = pc.getBoundingClientRect();
      return Math.max(0, Math.min(1, (cx - r.left) / r.width));
    };
    pc?.addEventListener('mousedown', (e) => {
      this.isDraggingProgress = true;
      this.pendingSeekPercent = calc(e.clientX);
      this._updateProgressVisual(this.pendingSeekPercent);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingProgress && pc) {
        this.pendingSeekPercent = calc(e.clientX);
        this._updateProgressVisual(this.pendingSeekPercent);
      }
      if (this.isDraggingVolume) this._handleVolumeChange(e);
    });
    window.addEventListener('mouseup', () => {
      if (this.isDraggingProgress) {
        this.isDraggingProgress = false;
        if (typeof this.pendingSeekPercent === 'number') {
          const dur = this.audioEngine.audio.duration || this.audioEngine.getCurrentTrack()?.duration || 0;
          if (dur > 0) {
            const target = this.pendingSeekPercent * dur;
            this.audioEngine.seekTo(target);
            if (DOM.player.currentTimeLabel) DOM.player.currentTimeLabel.textContent = formatTime(target);
          }
          this.pendingSeekPercent = null;
        }
      }
      this.isDraggingVolume = false;
    });
  }

  _updateProgressVisual(percent) {
    const dur = this.audioEngine.audio.duration || this.audioEngine.getCurrentTrack()?.duration || 0;
    updateProgressVisual(percent, dur);
  }

  _initVolumeControl() {
    DOM.player.volumeBarContainer?.addEventListener('mousedown', (e) => {
      this.isDraggingVolume = true;
      this._handleVolumeChange(e);
    });
    DOM.player.volumeBtn?.addEventListener('click', () => {
      updateVolumeUI(this.audioEngine.toggleMute() ? 0 : this.audioEngine.getVolume());
    });
  }

  _handleVolumeChange(e) {
    const c = DOM.player.volumeBarContainer;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    this.audioEngine.setVolume(percent);
    updateVolumeUI(percent);
  }

  _initEqualizer() {
    DOM.player.equalizerBtn?.addEventListener('click', () => DOM.modals.eq.overlay?.classList.add('active'));
    DOM.modals.eq.closeBtn?.addEventListener('click', () => DOM.modals.eq.overlay?.classList.remove('active'));
    const settings = Storage.getSettings();
    renderEqPresets(EQ_PRESETS, settings.eqPreset, (k) => {
      this.audioEngine.applyPreset(k);
      updateEqSliders(Storage.getSettings().eqBands || [0, 0, 0, 0, 0]);
      showToast(`Preset EQ: ${EQ_PRESETS[k].name}`);
    });
    DOM.modals.eq.sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        // @ts-ignore
        const band = parseInt(e.target?.getAttribute('data-band') || '0', 10);
        // @ts-ignore
        const val = parseFloat(e.target?.value || '0');
        const lbl = document.getElementById(`eqVal${band}`);
        if (lbl) lbl.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        this.audioEngine.setBandGain(band, val);
        DOM.modals.eq.presetsContainer?.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      });
    });
    updateEqSliders(settings.eqBands || [0, 0, 0, 0, 0]);
  }

  _initGlobalMediaKeys() {
    platform.onMediaKey({
      toggle: () => this.audioEngine.togglePlay(), next: () => this.audioEngine.next(), prev: () => this.audioEngine.prev()
    });
  }
}
