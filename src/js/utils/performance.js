// Utilidades de rendimiento, temporización y detección de hardware para Aura Music Player
import { Storage } from '../storage.js';

/**
 * Limita la frecuencia de ejecución de una función (Debounce)
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Retardo en ms
 * @returns {Function}
 */
export function debounce(fn, delay = 250) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Garantiza que una función se ejecute como máximo una vez cada cierto intervalo (Throttle)
 * @param {Function} fn - Función a ejecutar
 * @param {number} limit - Intervalo en ms
 * @returns {Function}
 */
export function throttle(fn, limit = 100) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

class PerformanceOrchestrator {
  constructor() {
    this._isHardwareConstrained = this._detectHardwareConstraints();
    this.isLowSpec = false;
  }

  _detectHardwareConstraints() {
    if (typeof navigator === 'undefined') return false;

    // Dispositivo con memoria RAM menor o igual a 2 GB
    // @ts-ignore
    const lowRam = navigator.deviceMemory && navigator.deviceMemory <= 2;

    // Procesador con 4 núcleos o menos
    const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

    // Dispositivo móvil detectado por User Agent o pantalla táctil pequeña
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth <= 768);

    return !!(lowRam || lowCores || isMobile);
  }

  /**
   * Inicializa el estado de rendimiento consultando la configuración o aplicando el auto-detector
   */
  init() {
    const settings = Storage.getSettings();
    const preference = settings.lowSpecMode; // undefined | 'auto' | true | false

    if (typeof preference === 'boolean') {
      this.isLowSpec = preference;
    } else {
      // Modo automático basado en hardware
      this.isLowSpec = this._isHardwareConstrained;
    }

    this._applyModeToDom();
  }

  _applyModeToDom() {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('low-spec-mode', this.isLowSpec);
  }

  /**
   * Alterna manualmente el modo de bajo consumo
   * @param {boolean} [forceState] 
   * @returns {boolean} Nuevo estado
   */
  toggleLowSpec(forceState) {
    this.isLowSpec = typeof forceState === 'boolean' ? forceState : !this.isLowSpec;
    Storage.saveSettings({ lowSpecMode: this.isLowSpec });
    this._applyModeToDom();
    return this.isLowSpec;
  }

  /**
   * Determina si el hardware o la configuración requieren renderizado ligero
   * @returns {boolean}
   */
  shouldThrottleGraphics() {
    return this.isLowSpec;
  }
}

export const perf = new PerformanceOrchestrator();
