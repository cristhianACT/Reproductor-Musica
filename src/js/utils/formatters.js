// Utilidades puras de formateo y sanitización para Aura Music Player

/**
 * Formatea una cantidad de segundos a formato "mm:ss" o "0:00"
 * @param {number} seconds - Duración en segundos
 * @returns {string} Tiempo formateado
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Sanitiza una cadena de texto para prevenir inyecciones HTML en renderizado dinámico
 * @param {string} str - Texto a escapar
 * @returns {string} Texto seguro para HTML
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
