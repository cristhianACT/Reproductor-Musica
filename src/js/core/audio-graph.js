// Gestión de Web Audio API, Analyser y Ecualizador Paramétrico
import { Storage } from '../storage.js';

export const EQ_PRESETS = {
  flat: { name: 'Plano', bands: [0, 0, 0, 0, 0] },
  bass_boost: { name: 'Refuerzo de Graves', bands: [7, 4, 0, -1, -2] },
  rock: { name: 'Rock', bands: [5, 3, -1, 3, 5] },
  pop: { name: 'Pop', bands: [-1, 2, 4, 3, -1] },
  acoustic: { name: 'Acústico', bands: [3, 1, 2, 3, 2] },
  vocal: { name: 'Vocal / Podcasts', bands: [-3, 1, 5, 3, -2] }
};

export class AudioGraph {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioCtx = null;
    /** @type {MediaElementAudioSourceNode|null} */
    this.sourceNode = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    /** @type {BiquadFilterNode[]} */
    this.eqFilters = [];
  }

  /**
   * @param {HTMLMediaElement} audioElement
   */
  setup(audioElement) {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || window['webkitAudioContext'];
      if (!AudioCtxClass) return;
      this.audioCtx = new AudioCtxClass();
      const ctx = this.audioCtx;

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = audioElement.muted ? 0 : audioElement.volume;

      const freqs = [60, 250, 1000, 4000, 14000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
      const settings = Storage.getSettings();
      const bands = settings.eqBands || [0, 0, 0, 0, 0];

      this.eqFilters = freqs.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        // @ts-ignore
        filter.type = types[i];
        filter.frequency.value = freq;
        filter.gain.value = bands[i] || 0;
        return filter;
      });

      this.sourceNode = ctx.createMediaElementSource(audioElement);
      /** @type {AudioNode} */
      let prevNode = this.sourceNode;
      for (const filter of this.eqFilters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
    } catch (err) {
      console.warn('Web Audio API no pudo inicializarse:', err);
    }
  }

  /**
   * @param {HTMLMediaElement} audioElement
   */
  async resume(audioElement) {
    if (!this.audioCtx) this.setup(audioElement);
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.warn('No se pudo reanudar AudioContext:', err);
      }
    }
    if (this.masterGain) {
      this.masterGain.gain.value = audioElement.muted ? 0 : audioElement.volume;
    }
  }

  /**
   * @param {number} vol
   * @param {boolean} isMuted
   */
  setVolume(vol, isMuted) {
    if (this.masterGain) {
      this.masterGain.gain.value = isMuted ? 0 : vol;
    }
  }

  /**
   * @param {number} index
   * @param {number} gainDb
   */
  setBandGain(index, gainDb) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = gainDb;
      const settings = Storage.getSettings();
      const bands = [...(settings.eqBands || [0, 0, 0, 0, 0])];
      bands[index] = gainDb;
      Storage.saveSettings({ eqBands: bands, eqPreset: 'custom' });
    }
  }

  /**
   * @param {string} presetKey
   * @param {HTMLMediaElement} audioElement
   */
  applyPreset(presetKey, audioElement) {
    // @ts-ignore
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;
    if (!this.audioCtx) this.setup(audioElement);
    preset.bands.forEach((val, idx) => {
      if (this.eqFilters[idx]) this.eqFilters[idx].gain.value = val;
    });
    Storage.saveSettings({ eqPreset: presetKey, eqBands: [...preset.bands] });
  }

  /**
   * @param {Uint8Array} targetArray
   */
  getFrequencyData(targetArray) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(targetArray);
    }
  }
}
