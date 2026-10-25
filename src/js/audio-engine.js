// Motor de audio basado en HTML5 Audio con streaming optimizado y desacoplado
import { Storage } from './storage.js';
import { platform } from './core/platform-bridge.js';
import { AudioGraph, EQ_PRESETS } from './core/audio-graph.js';
import { offlineManager } from './services/offline-manager.js';
import { streamingService } from './services/streaming-service.js';

export { EQ_PRESETS };

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'metadata';

    this.queue = [];
    this.currentIndex = -1;
    this.isShuffle = false;
    this.shuffleIndices = [];
    this.shufflePointer = 0;
    this.repeatMode = 'none';

    this.onTrackChange = this.onPlayStateChange = this.onTimeUpdate = null;
    this.onTrackEnded = this.onError = null;
    this.graph = new AudioGraph();

    this._initAudioEvents();
    this._loadSettings();
  }

  _initAudioEvents() {
    this.audio.addEventListener('play', async () => {
      await this.graph.resume(this.audio);
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });

    this.audio.addEventListener('pause', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    });

    const notifyTime = () => {
      if (this.onTimeUpdate) {
        const cur = this.getCurrentTrack();
        const dur = (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0)
          ? this.audio.duration : (cur?.duration || 0);
        this.onTimeUpdate(this.audio.currentTime, dur);
      }
    };

    this.audio.addEventListener('timeupdate', notifyTime);
    this.audio.addEventListener('loadedmetadata', notifyTime);
    this.audio.addEventListener('ended', () => this._handleTrackEnded());
    this.audio.addEventListener('error', (e) => {
      console.error('Error de audio:', e);
      if (this.onError) this.onError(e);
    });
  }

  _loadSettings() {
    const s = Storage.getSettings();
    this.audio.volume = typeof s.volume === 'number' ? s.volume : 0.85;
    this.audio.muted = !!s.isMuted;
    this.isShuffle = !!s.isShuffle;
    this.repeatMode = s.repeatMode || 'none';
  }

  setQueue(tracks, startIndex = 0, autoPlay = true) {
    if (!tracks?.length) return;
    this.queue = [...tracks];
    this._generateShuffleOrder();
    if (startIndex >= 0 && startIndex < this.queue.length) {
      this.playTrackAtIndex(startIndex, autoPlay);
    }
  }

  addToQueueNext(t) { if (!t) return; if (!this.queue.length) return this.setQueue([t], 0, true); this.queue.splice(this.currentIndex + 1, 0, t); this._generateShuffleOrder(); }
  addToQueueEnd(t) { if (!t) return; if (!this.queue.length) return this.setQueue([t], 0, true); this.queue.push(t); this._generateShuffleOrder(); }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      if (this.queue.length > 0) {
        this.playTrackAtIndex(Math.min(index, this.queue.length - 1), true);
      } else {
        this.audio.pause();
        this.audio.src = '';
        this.currentIndex = -1;
        if (this.onTrackChange) this.onTrackChange(null, -1);
      }
    }
    this._generateShuffleOrder();
  }

  _generateShuffleOrder() {
    const len = this.queue.length;
    this.shuffleIndices = Array.from({ length: len }, (_, i) => i);
    for (let i = len - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffleIndices[i], this.shuffleIndices[j]] = [this.shuffleIndices[j], this.shuffleIndices[i]];
    }
    this.shufflePointer = Math.max(0, this.shuffleIndices.indexOf(this.currentIndex));
  }

  async playTrackAtIndex(index, autoPlay = true) {
    if (index < 0 || index >= this.queue.length) return;
    this.currentIndex = index;
    const track = this.queue[index];
    if (this.onTrackChange) this.onTrackChange(track, index);
    Storage.addToHistory(track);

    let audioSrc = '';
    if (offlineManager.isOffline(track.id)) {
      audioSrc = await offlineManager.getOfflineAudioUrl(track.id);
    } else if (track.isOnline) {
      if (!navigator.onLine) {
        if (this.onError) this.onError(new Error('offline_no_network'));
        return;
      }
      audioSrc = await streamingService.getAudioStreamUrl(track);
    }
    if (!audioSrc) audioSrc = platform.getAudioStreamUrl(track);

    if (!audioSrc) {
      if (this.onError) this.onError(new Error('stream_unavailable'));
      return;
    }

    this.audio.src = audioSrc;
    this.audio.load();
    if (autoPlay) {
      await this.graph.resume(this.audio);
      this.audio.play().catch(err => console.warn('Autoplay bloqueado:', err));
    }
    this._preloadNextTrack();
  }

  _preloadNextTrack() {
    const nextIdx = this.isShuffle ? this.shuffleIndices[this.shufflePointer + 1] : this.currentIndex + 1;
    const next = this.queue[nextIdx];
    if (next && next.isOnline && !offlineManager.isOffline(next.id)) streamingService.getAudioStreamUrl(next).catch(() => {});
  }

  async play() {
    if (this.currentIndex === -1 && this.queue.length > 0) return this.playTrackAtIndex(0, true);
    await this.graph.resume(this.audio);
    return this.audio.play();
  }

  pause() { this.audio.pause(); }
  togglePlay() { this.audio.paused ? this.play() : this.pause(); }

  next() {
    if (!this.queue.length) return;
    if (this.isShuffle) {
      this.shufflePointer++;
      if (this.shufflePointer >= this.shuffleIndices.length) {
        if (this.repeatMode !== 'all') { this._checkAutoQueue(); return; }
        this._generateShuffleOrder();
        this.shufflePointer = 0;
      }
      this.playTrackAtIndex(this.shuffleIndices[this.shufflePointer], true);
    } else {
      let nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.queue.length) {
        if (this.repeatMode !== 'all') { this._checkAutoQueue(); return; }
        nextIndex = 0;
      }
      this.playTrackAtIndex(nextIndex, true);
    }
  }

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 3) return this.seekTo(0);
    if (this.isShuffle) {
      this.shufflePointer--;
      if (this.shufflePointer < 0) this.shufflePointer = this.shuffleIndices.length - 1;
      this.playTrackAtIndex(this.shuffleIndices[this.shufflePointer], true);
    } else {
      let prevIndex = this.currentIndex - 1;
      if (prevIndex < 0) prevIndex = this.repeatMode === 'all' ? this.queue.length - 1 : 0;
      this.playTrackAtIndex(prevIndex, true);
    }
  }

  seekTo(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || !isFinite(seconds)) return;
    const dur = (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0) ? this.audio.duration : (this.getCurrentTrack()?.duration || 0);
    try { this.audio.currentTime = dur > 0 ? Math.max(0, Math.min(seconds, dur)) : Math.max(0, seconds); } catch (err) {}
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.audio.volume = clamped;
    this.graph.setVolume(clamped, this.audio.muted);
    Storage.saveSettings({ volume: clamped });
  }

  getVolume() { return this.audio.volume; }
  isMuted() { return this.audio.muted; }
  isPlaying() { return !this.audio.paused; }
  getCurrentTrack() { return this.queue[this.currentIndex] || null; }
  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.graph.setVolume(this.audio.volume, this.audio.muted);
    Storage.saveSettings({ isMuted: this.audio.muted });
    return this.audio.muted;
  }
  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) this._generateShuffleOrder();
    Storage.saveSettings({ isShuffle: this.isShuffle });
    return this.isShuffle;
  }
  cycleRepeatMode() {
    const modes = ['none', 'all', 'one'];
    this.repeatMode = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
    Storage.saveSettings({ repeatMode: this.repeatMode });
    return this.repeatMode;
  }

  _handleTrackEnded() {
    if (this.repeatMode === 'one') { this.seekTo(0); this.play(); }
    else { this.next(); }
    if (this.onTrackEnded) this.onTrackEnded();
  }

  async _checkAutoQueue() {
    const cur = this.getCurrentTrack();
    if (!cur) return;
    try {
      const related = await streamingService.getRelatedTracks(cur);
      if (related?.length > 0) {
        const nextIdx = this.queue.length;
        this.queue.push(...related);
        this._generateShuffleOrder();
        this.playTrackAtIndex(nextIdx, true);
      }
    } catch (e) {}
  }

  setBandGain(index, gainDb) { this.graph.setBandGain(index, gainDb); }
  applyPreset(presetKey) { this.graph.applyPreset(presetKey, this.audio); }
  getFrequencyData(targetArray) { this.graph.getFrequencyData(targetArray); }
}
