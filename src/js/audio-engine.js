// Motor de audio basado en HTML5 Audio y Web Audio API con ecualizador paramétrico y analizador
import { Storage } from './storage.js';

export const EQ_PRESETS = {
  flat: { name: 'Plano', bands: [0, 0, 0, 0, 0] },
  bass_boost: { name: 'Refuerzo de Graves', bands: [7, 4, 0, -1, -2] },
  rock: { name: 'Rock', bands: [5, 3, -1, 3, 5] },
  pop: { name: 'Pop', bands: [-1, 2, 4, 3, -1] },
  acoustic: { name: 'Acústico', bands: [3, 1, 2, 3, 2] },
  vocal: { name: 'Vocal / Podcasts', bands: [-3, 1, 5, 3, -2] }
};

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous'; // Necesario para evitar que Chromium silencie el audio en MediaElementAudioSource
    this.audio.preload = 'auto';

    // Lista de reproducción y estados
    this.queue = [];
    this.currentIndex = -1;
    this.isShuffle = false;
    this.shuffleIndices = [];
    this.shufflePointer = 0;
    this.repeatMode = 'none'; // 'none' | 'all' | 'one'

    // Callbacks de eventos
    this.onTrackChange = null;
    this.onPlayStateChange = null;
    this.onTimeUpdate = null;
    this.onTrackEnded = null;
    this.onError = null;

    // Web Audio API
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.masterGain = null;
    this.eqFilters = [];

    this._initAudioEvents();
    this._loadSettings();
  }

  _initAudioEvents() {
    this.audio.addEventListener('play', async () => {
      await this._resumeContext();
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });

    this.audio.addEventListener('pause', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) {
        const curTrack = this.getCurrentTrack();
        const dur = (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0)
          ? this.audio.duration
          : (curTrack?.duration || 0);
        this.onTimeUpdate(this.audio.currentTime, dur);
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.onTimeUpdate) {
        const curTrack = this.getCurrentTrack();
        const dur = (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0)
          ? this.audio.duration
          : (curTrack?.duration || 0);
        this.onTimeUpdate(this.audio.currentTime, dur);
      }
    });

    this.audio.addEventListener('ended', () => {
      this._handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Error de reproducción de audio:', e);
      if (this.onError) this.onError(e);
    });
  }

  _loadSettings() {
    const settings = Storage.getSettings();
    this.audio.volume = typeof settings.volume === 'number' ? settings.volume : 0.85;
    this.audio.muted = !!settings.isMuted;
    this.isShuffle = !!settings.isShuffle;
    this.repeatMode = settings.repeatMode || 'none';
  }

  // Inicializa el contexto de Web Audio bajo demanda
  _setupWebAudio() {
    if (this.audioCtx) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      // Analizador de frecuencias
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;

      // Master Gain Node para control de volumen transparente
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.audio.muted ? 0 : this.audio.volume;

      // Bandas de Ecualizador: 60Hz, 250Hz, 1kHz, 4kHz, 14kHz
      const freqs = [60, 250, 1000, 4000, 14000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      const settings = Storage.getSettings();
      const bands = settings.eqBands || [0, 0, 0, 0, 0];

      this.eqFilters = freqs.map((freq, i) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = freq;
        filter.gain.value = bands[i] || 0;
        return filter;
      });

      // Conectar audio element -> EQ filters -> Analyser -> MasterGain -> Destination
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      let prevNode = this.sourceNode;
      for (const filter of this.eqFilters) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      prevNode.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API no pudo inicializarse completamente:', err);
    }
  }

  async _resumeContext() {
    if (!this.audioCtx) {
      this._setupWebAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn('No se pudo reanudar el AudioContext:', err);
      }
    }
    if (this.masterGain) {
      this.masterGain.gain.value = this.audio.muted ? 0 : this.audio.volume;
    }
  }

  // Asignar cola de reproducción
  setQueue(tracks, startIndex = 0, autoPlay = true) {
    if (!tracks || tracks.length === 0) return;
    this.queue = [...tracks];
    this._generateShuffleOrder();

    if (startIndex >= 0 && startIndex < this.queue.length) {
      this.playTrackAtIndex(startIndex, autoPlay);
    }
  }

  addToQueueNext(track) {
    if (!track) return;
    if (this.queue.length === 0) {
      this.setQueue([track], 0, true);
      return;
    }
    const insertIdx = this.currentIndex + 1;
    this.queue.splice(insertIdx, 0, track);
    this._generateShuffleOrder();
  }

  addToQueueEnd(track) {
    if (!track) return;
    if (this.queue.length === 0) {
      this.setQueue([track], 0, true);
      return;
    }
    this.queue.push(track);
    this._generateShuffleOrder();
  }

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
    // Fisher-Yates shuffle
    for (let i = len - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffleIndices[i], this.shuffleIndices[j]] = [this.shuffleIndices[j], this.shuffleIndices[i]];
    }
    this.shufflePointer = this.shuffleIndices.indexOf(this.currentIndex);
    if (this.shufflePointer === -1) this.shufflePointer = 0;
  }

  async playTrackAtIndex(index, autoPlay = true) {
    if (index < 0 || index >= this.queue.length) return;

    this.currentIndex = index;
    const track = this.queue[index];

    // Obtener la URL de streaming nativa de Electron
    const streamUrl = window.electronAPI ? window.electronAPI.getAudioStreamUrl(track.path) : track.path;

    this.audio.src = streamUrl;
    this.audio.load();

    if (this.onTrackChange) {
      this.onTrackChange(track, index);
    }

    if (autoPlay) {
      await this._resumeContext();
      this.audio.play().catch(err => {
        console.warn('Error al iniciar reproducción automática:', err);
      });
    }
  }

  async play() {
    if (this.currentIndex === -1 && this.queue.length > 0) {
      this.playTrackAtIndex(0, true);
      return;
    }
    await this._resumeContext();
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.isShuffle) {
      this.shufflePointer++;
      if (this.shufflePointer >= this.shuffleIndices.length) {
        if (this.repeatMode === 'all') {
          this._generateShuffleOrder();
          this.shufflePointer = 0;
        } else {
          return;
        }
      }
      const nextIndex = this.shuffleIndices[this.shufflePointer];
      this.playTrackAtIndex(nextIndex, true);
    } else {
      let nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.queue.length) {
        if (this.repeatMode === 'all') {
          nextIndex = 0;
        } else {
          return;
        }
      }
      this.playTrackAtIndex(nextIndex, true);
    }
  }

  prev() {
    if (this.queue.length === 0) return;

    // Si ya lleva más de 3 segundos reproduciéndose, reiniciar pista actual
    if (this.audio.currentTime > 3) {
      this.seekTo(0);
      return;
    }

    if (this.isShuffle) {
      this.shufflePointer--;
      if (this.shufflePointer < 0) {
        this.shufflePointer = this.shuffleIndices.length - 1;
      }
      const prevIndex = this.shuffleIndices[this.shufflePointer];
      this.playTrackAtIndex(prevIndex, true);
    } else {
      let prevIndex = this.currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = this.repeatMode === 'all' ? this.queue.length - 1 : 0;
      }
      this.playTrackAtIndex(prevIndex, true);
    }
  }

  seekTo(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || !isFinite(seconds)) return;
    const curTrack = this.getCurrentTrack();
    const dur = (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 0)
      ? this.audio.duration
      : (curTrack?.duration || 0);

    const target = dur > 0 ? Math.max(0, Math.min(seconds, dur)) : Math.max(0, seconds);
    try {
      this.audio.currentTime = target;
    } catch (err) {
      console.warn('Error al ajustar currentTime en audio:', err);
    }
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.audio.volume = clamped;
    if (this.masterGain) {
      this.masterGain.gain.value = this.audio.muted ? 0 : clamped;
    }
    Storage.saveSettings({ volume: clamped });
  }

  getVolume() {
    return this.audio.volume;
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.audio.muted ? 0 : this.audio.volume;
    }
    Storage.saveSettings({ isMuted: this.audio.muted });
    return this.audio.muted;
  }

  isMuted() {
    return this.audio.muted;
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      this._generateShuffleOrder();
    }
    Storage.saveSettings({ isShuffle: this.isShuffle });
    return this.isShuffle;
  }

  cycleRepeatMode() {
    // none -> all -> one -> none
    if (this.repeatMode === 'none') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'none';
    }
    Storage.saveSettings({ repeatMode: this.repeatMode });
    return this.repeatMode;
  }

  _handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.seekTo(0);
      this.play();
    } else {
      this.next();
    }
    if (this.onTrackEnded) this.onTrackEnded();
  }

  getCurrentTrack() {
    return this.queue[this.currentIndex] || null;
  }

  isPlaying() {
    return !this.audio.paused;
  }

  // Ecualizador
  setBandGain(index, gainDb) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = gainDb;
      const settings = Storage.getSettings();
      const bands = [...settings.eqBands];
      bands[index] = gainDb;
      Storage.saveSettings({ eqBands: bands, eqPreset: 'custom' });
    }
  }

  applyPreset(presetKey) {
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;
    this._setupWebAudio();
    preset.bands.forEach((val, idx) => {
      if (this.eqFilters[idx]) {
        this.eqFilters[idx].gain.value = val;
      }
    });
    Storage.saveSettings({ eqPreset: presetKey, eqBands: [...preset.bands] });
  }

  // Analizador para el visualizador
  getFrequencyData(targetArray) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(targetArray);
    }
  }
}
