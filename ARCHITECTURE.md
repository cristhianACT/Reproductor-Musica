# AURA MUSIC PLAYER - Guía de Arquitectura y Estándares de Ingeniería

Este documento define las reglas obligatorias de arquitectura, metodología, consistencia de código y presupuesto de rendimiento para **Aura Music Player** (Desktop con Electron & Mobile Low-Spec). Todo agente de IA o desarrollador que modifique este repositorio debe cumplir estrictamente estos lineamientos.

---

## 1. Metodología de Desarrollo: SDD + Ciclo Iterativo (RUP Ágil)
1. **Spec-Driven Development (SDD):** Antes de implementar una nueva funcionalidad, se debe definir su estado en `core/state.js` y sus eventos asociados.
2. **Entregas Incrementales:** Ningún cambio debe romper el funcionamiento actual. Cada refactorización o feature debe ser atómica y verificable de forma aislada.
3. **Límite de Tamaño por Archivo:** Ningún archivo `.js` debe superar las **250 líneas de código**. Si un módulo crece más allá de ese límite, debe dividirse por responsabilidad.

---

## 2. Arquitectura del Sistema (Clean MVC Reactivo + Ports & Adapters)

El proyecto utiliza **Vanilla JavaScript (ES Modules)** sin frameworks pesados para garantizar máximo rendimiento. El flujo de datos es estrictamente **Unidireccional**:
`Evento de Usuario (UI)` -> `Controller` -> `State (Pub/Sub)` -> `View (Renderizado DOM)`

### Estructura de Directorios en `src/js/`
```text
src/js/
├── app.js                         # Entry point (Solo inicialización, máx. 120 líneas)
├── core/
│   ├── state.js                   # Estado global único + EventTarget (Pub/Sub)
│   └── platform-bridge.js         # Adaptador Multiplataforma (Electron IPC vs Web/Mobile File API)
├── controllers/
│   ├── player-controller.js       # Lógica de reproducción, cola, shuffle, repeat, MediaSession
│   ├── library-controller.js      # Carga de archivos, indexación, búsqueda y filtros
│   └── playlist-controller.js     # CRUD de playlists y favoritos
├── services/
│   ├── audio-engine.js            # Web Audio API, GainNodes, EQ, streaming por elemento <audio>
│   ├── storage.js                 # Persistencia en IndexedDB / LocalStorage
│   ├── visualizer.js              # Renderizado Canvas 2D con control de FPS y visibilidad
│   └── ai-argon-service.js        # Integración con Gemini 4 Argon (Auto-DJ, análisis, letras)
├── ui/
│   ├── dom-elements.js            # Caché centralizada de referencias al DOM
│   ├── tracklist-view.js          # Renderizado virtualizado de listas y delegación de eventos
│   ├── player-bar-view.js         # Actualización de barra inferior, tiempos y controles
│   └── modals-view.js             # Gestión de modales, toasts, ajustes y temas
└── utils/
    ├── formatters.js              # Formateo de tiempo (mm:ss), textos y sanitización
    └── performance.js             # Detección de hardware (Low-Spec), debounce, throttle
Reglas de Acoplamiento
Prohibido llamar a Electron directamente en Controladores o Vistas: Toda interacción con el sistema operativo debe pasar por core/platform-bridge.js.

Prohibido mutar el DOM desde los Servicios: audio-engine.js y storage.js nunca deben usar document.querySelector. Se comunican emitiendo eventos o retornando promesas.

Imports Estrictos: Todos los imports de ES Modules deben incluir la extensión .js (ej. import { state } from '../core/state.js';).

3. Presupuesto de Rendimiento (Optimización para Móviles de 1 GB de RAM)
El objetivo es mantener el consumo de memoria RAM del renderer por debajo de 80 MB y garantizar 60 FPS en el scroll (o 30 FPS estables en modo ahorro).

Streaming de Audio, No Decodificación Completa en RAM:

Usar un único elemento <audio preload="metadata"> conectado a una única instancia de AudioContext mediante MediaElementAudioSourceNode.

Evitar AudioContext.decodeAudioData() en pistas completas para no saturar la RAM en dispositivos de 1 GB.

Gestión de Carátulas (Covers):

Prohibido almacenar imágenes en Base64 de alta resolución en memoria o en localStorage.

Redimensionar miniaturas para listas a máximo 150x150px (WebP/JPEG comprimido) o usar URL.createObjectURL(blob) liberando memoria con URL.revokeObjectURL() al desmontar.

DOM y Listas Grandes (Virtualización & Delegación):

Prohibido usar innerHTML += dentro de bucles. Usar siempre DocumentFragment.

Aplicar Event Delegation: Un solo listener click en el contenedor de la lista de canciones en lugar de un listener por cada fila.

Mantener un máximo de 40-50 filas renderizadas en el DOM mediante ventana virtual o paginación progresiva si la biblioteca supera las 100 pistas.

Modo Bajo Consumo Automático (Low-Spec Mode):

Detectar navigator.deviceMemory <= 2 o navigator.hardwareConcurrency <= 4 (o preferencia del usuario) para activar la clase body.low-spec-mode.

En low-spec-mode: desactivar backdrop-filter: blur(), sombras complejas y animaciones costosas; limitar el visualizer.js a devicePixelRatio = 1 y 24 FPS.

Pausar completamente el requestAnimationFrame del visualizador cuando audio.paused === true o document.hidden === true.

4. Estándares de Código y CSS
Tipado Documentado: Añadir // @ts-check o bloques JSDoc (@param, @returns) en las funciones públicas de cada módulo.

Contrato Base de Canción (Track):

JavaScript
/**
 * @typedef {Object} Track
 * @property {string} id - Identificador único (hash o UUID)
 * @property {string} title - Título de la canción
 * @property {string} artist - Artista o "Artista desconocido"
 * @property {string} album - Álbum
 * @property {number} duration - Duración en segundos
 * @property {string} path - Ruta local o ObjectURL
 * @property {string|null} coverUrl - Miniatura optimizada
 */
CSS con Metodología BEM + Design Tokens:

Usar clases planas con nomenclatura BEM (.bloque__elemento--modificador).

Todos los colores, espaciados y efectos deben provenir de src/styles/variables.css.

Diseño Mobile-First / Touch-Friendly: Todo botón interactivo debe tener un área mínima de toque de 44x44px en pantallas menores a 768px.