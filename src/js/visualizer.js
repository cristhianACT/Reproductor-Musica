// Visualizador de audio reactivo con Canvas 2D optimizado para alto rendimiento y bajo consumo
import { perf } from './utils/performance.js';
import { platform } from './core/platform-bridge.js';

export class AudioVisualizer {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: true });
    this.audioEngine = audioEngine;
    this.animationId = null;
    this.isActive = false;

    // Frecuencias
    this.dataArray = new Uint8Array(128);

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas(), { passive: true });

    // Suspender renderizado cuando la pestaña o pantalla esté oculta/apagada
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._pauseLoop();
      } else if (this.isActive && this.audioEngine.isPlaying()) {
        this.start();
      }
    });

    // Conectar con cambios de estado de reproducción para no consumir GPU en pausa
    if (this.audioEngine) {
      const prevPlayChange = this.audioEngine.onPlayStateChange;
      this.audioEngine.onPlayStateChange = (isPlaying) => {
        if (prevPlayChange) prevPlayChange(isPlaying);
        if (isPlaying && this.isActive && !document.hidden) {
          this.start();
        } else {
          this._pauseLoop();
        }
      };
    }
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    // Forzar DPR 1 en dispositivos móviles o modo bajo consumo para no saturar fill-rate de la GPU
    const isConstrained = perf.shouldThrottleGraphics() || platform.isMobile;
    const dpr = isConstrained ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toggle(forceState) {
    this.isActive = typeof forceState === 'boolean' ? forceState : !this.isActive;
    const overlay = this.canvas.parentElement;
    if (this.isActive) {
      if (overlay) overlay.classList.add('active');
      this._resizeCanvas();
      if (this.audioEngine.isPlaying() && !document.hidden) {
        this.start();
      }
    } else {
      if (overlay) overlay.classList.remove('active');
      this.stop();
    }
    return this.isActive;
  }

  start() {
    if (this.animationId || !this.isActive || document.hidden) return;
    const render = () => {
      if (!this.audioEngine.isPlaying() || document.hidden) {
        this._pauseLoop();
        return;
      }
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  _pauseLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  stop() {
    this._pauseLoop();
    if (this.ctx && this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.clearRect(0, 0, rect.width, rect.height);
    }
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    if (!this.audioEngine.isPlaying()) {
      return;
    }

    this.audioEngine.getFrequencyData(this.dataArray);

    // Ajustar número de barras: 28 en Low-Spec para reducir cómputo en 50%, 56 en Desktop
    const isLowSpec = perf.shouldThrottleGraphics() || platform.isMobile;
    const barCount = isLowSpec ? 28 : 56;
    const spacing = 4;
    const totalSpacing = spacing * (barCount - 1);
    const barWidth = Math.max(3, (width - totalSpacing) / barCount);

    const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.15)');
    gradient.addColorStop(0.5, 'rgba(0, 242, 254, 0.75)');
    gradient.addColorStop(0.85, 'rgba(127, 0, 255, 0.85)');
    gradient.addColorStop(1, '#00f2fe');

    this.ctx.fillStyle = gradient;

    for (let i = 0; i < barCount; i++) {
      const sampleIndex = Math.floor((i / barCount) * (this.dataArray.length * 0.8));
      const value = this.dataArray[sampleIndex] || 0;
      const percent = value / 255;
      const barHeight = Math.max(4, percent * (height - 12));

      const x = i * (barWidth + spacing);
      const y = height - barHeight;

      // Dibujar barra con punta redondeada
      this.ctx.beginPath();
      const radius = Math.min(barWidth / 2, 4);
      this.ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
      this.ctx.fill();

      // Punto brillante solo en modo completo (no en low-spec para ahorrar llamadas a arc())
      if (!isLowSpec && barHeight > 10) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(x + barWidth / 2, y + 2, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = gradient;
      }
    }
  }
}
