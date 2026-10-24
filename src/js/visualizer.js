// Visualizador de audio reactivo con Canvas 2D
export class AudioVisualizer {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.animationId = null;
    this.isActive = false;
    this.mode = 'bars'; // 'bars' | 'wave'

    // Frecuencias
    this.dataArray = new Uint8Array(128);

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  toggle(forceState) {
    this.isActive = typeof forceState === 'boolean' ? forceState : !this.isActive;
    const overlay = this.canvas.parentElement;
    if (this.isActive) {
      if (overlay) overlay.classList.add('active');
      this._resizeCanvas();
      this.start();
    } else {
      if (overlay) overlay.classList.remove('active');
      this.stop();
    }
    return this.isActive;
  }

  start() {
    if (this.animationId) return;
    const render = () => {
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
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

    const barCount = 56;
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

      // Punto brillante en la punta
      if (barHeight > 10) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(x + barWidth / 2, y + 2, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = gradient;
      }
    }
  }
}
