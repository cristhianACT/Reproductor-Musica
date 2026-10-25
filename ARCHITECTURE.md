# AURA MUSIC PLAYER - Guía de Arquitectura y Estándares de Ingeniería

Este documento define las reglas obligatorias de arquitectura, metodología, consistencia de código, sistema de diseño y presupuesto de rendimiento para **Aura Music Player** (Desktop con Electron & Mobile Low-Spec con Capacitor). Todo agente de IA o desarrollador que modifique este repositorio debe cumplir estrictamente estos lineamientos.

---

## 1. Metodología de Desarrollo: SDD + Clean Architecture
1. **Spec-Driven Development (SDD):** Antes de implementar una nueva funcionalidad, se debe definir su estado en `core/state.js` y sus eventos asociados.
2. **Entregas Incrementales:** Ningún cambio debe romper el funcionamiento actual. Cada refactorización o feature debe ser atómica y verificable de forma aislada.
3. **Límite de Tamaño por Archivo:** Ningún archivo `.js` dentro de `src/js/` debe superar las **250 líneas de código**. Si un módulo crece más allá de ese límite, debe dividirse por responsabilidad.
4. **Cero Dependencias de Pago:** Toda la arquitectura de música, catálogo y letras debe operar al 100% con endpoints públicos, libres y sin necesidad de API Keys ni tarjetas de crédito.

---

## 2. Arquitectura del Sistema (Clean MVC Reactivo + Ports & Adapters)

El proyecto utiliza **Vanilla JavaScript (ES Modules)** sin frameworks pesados para garantizar máximo rendimiento. El flujo de datos es estrictamente **Unidireccional**:
`Evento de Usuario (UI)` -> `Controller` -> `State (EventTarget Pub/Sub)` -> `View (Renderizado DOM)`

### Estructura Modular en `src/js/`
```text
src/js/
├── app.js                         # Entry point (Solo inicialización orquestada, máx. 120 líneas)
├── storage.js                     # Persistencia en IndexedDB / LocalStorage
├── audio-engine.js                # Web Audio API, GainNodes, EQ, streaming por elemento <audio>
├── visualizer.js                  # Renderizado Canvas 2D con control de FPS y visibilidad
├── core/
│   ├── state.js                   # Estado global único + EventTarget (Pub/Sub)
│   ├── platform-bridge.js         # Adaptador Multiplataforma (Electron IPC vs Capacitor vs Web File API)
│   └── memory-manager.js          # Control de ObjectURLs y garbage collection de carátulas
├── controllers/
│   ├── player-controller.js       # Reproducción, cola, auto-queue, shuffle, repeat, MediaSession
│   ├── library-controller.js      # Carga de archivos, indexación local, búsqueda y filtros
│   └── playlist-controller.js     # CRUD de playlists y favoritos
├── services/
│   ├── streaming-service.js       # Catálogo mundial (iTunes+Audius) y extractor de audio 3-Tier
│   ├── offline-manager.js         # Descargas offline con seguimiento de progreso y guardado en disco
│   └── lyrics-service.js          # Letras sincronizadas en tiempo real vía lrclib.net
├── ui/
│   ├── dom-elements.js            # Caché centralizada de referencias al DOM
│   ├── home-view.js               # Vista de Inicio con feeds por estados de ánimo y charts
│   ├── search-results-view.js     # Vista categorizada (Mejor resultado, online, biblioteca)
│   ├── tracklist-view.js          # Renderizado virtualizado de listas y delegación de eventos
│   ├── player-bar-view.js         # Barra inferior tipo Floating Glass Dock, tiempos y controles
│   ├── lyrics-view.js             # Modo karaoke con versos activos y scroll suave
│   ├── grid-view.js               # Vista de cuadrícula para álbumes y carpetas
│   └── modals-view.js             # Modales, toasts, ajustes y selector de temas
└── utils/
    ├── formatters.js              # Formateo de tiempo (mm:ss), textos y sanitización
    └── performance.js             # Detección de hardware (Low-Spec), debounce, throttle
```

### Reglas de Acoplamiento y Dependencias
- **Prohibido llamar a Electron o Capacitor directamente en Controladores o Vistas:** Toda interacción con el sistema operativo debe pasar exclusivamente por `core/platform-bridge.js`.
- **Prohibido mutar el DOM desde los Servicios:** `audio-engine.js`, `streaming-service.js`, `offline-manager.js` y `storage.js` nunca deben usar `document.querySelector`. Se comunican emitiendo eventos a través de `state` o retornando promesas.
- **Imports Estrictos:** Todos los imports de ES Modules deben incluir la extensión `.js` explícita (ej. `import { state } from '../core/state.js';`).

---

## 3. Motor de Streaming Mundial Gratuito (Catálogo + Extractor Libre)

Aura implementa el patrón de arquitectura abierta de *Spotube* e *InnerTune*:

1. **Catálogo Comercial Instantáneo:**
   - **iTunes Search API:** Búsqueda rápida de canciones con metadatos completos y carátulas HD sustituyendo `100x100bb` por `600x600bb`.
   - **Apple Music / iTunes Charts RSS:** Feed de éxitos mundiales sin autenticación.
   - **Audius Public API:** Catálogo libre de streaming completo de alta velocidad.
2. **Resolución de Audio en 3 Niveles:**
   - **Nivel 1 (IPC Nativo Electron):** Búsqueda directa en YouTube y extracción del formato de audio de mayor bitrate sin bloqueos CORS de navegador.
   - **Nivel 2 (Invidious / Piped Multi-Instancia):** Fallback para Android/Web rotando servidores públicos con `AbortController` de 2.5s.
   - **Nivel 3 (Respaldo Garantizado):** Stream directo de Audius o `previewUrl` de iTunes para garantizar cero errores y cero silencio.
3. **Letras Sincronizadas (`lrclib.net`):**
   - Conexión directa y gratuita para obtener la letra timestamped `[mm:ss.xx]` con resaltado interactivo.

---

## 4. Sistema de Diseño: Emil Kowalski + Impeccable

- **Paleta Monocromática Obsidiana / Zinc:**
  - Fondo Canvas: `#08080a` | Superficie Sidebar: `#0e0e11` | Elevado: `#16161a`
  - Bordes estructurales Hairline: `1px solid rgba(255, 255, 255, 0.07)`
  - Luz especular cenital: `1px solid rgba(255, 255, 255, 0.14)`
  - Acento: Blanco puro `#ffffff` de alto contraste; el color emana de las carátulas.
- **Física y Micro-interacciones:**
  - Curvas físicas: `--ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1)` y `--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.15)`.
  - Todo botón interactivo responde al clic con `transform: scale(0.96)`.
  - Al hover en las filas de canciones, el número `#` se desvanece y emerge el botón `▶` en 150ms.
  - La barra de progreso es un hilo de luz de 3px que se expande a 5px con thumb visible al hover.
- **Tipografía Suiza de Precisión:**
  - Tipografías `'Inter'` o `'Geist'`, anti-aliasing forzado y `font-variant-numeric: tabular-nums` en todos los números, tiempos y duraciones para evitar vibraciones visuales.
- **Layout Adaptable Responsive:**
  - **Desktop (> 768px):** Sidebar compacta, header minimalista de una sola línea y reproductor tipo *Floating Glass Dock*.
  - **Mobile (<= 768px):** Bottom Navigation bar, mini-reproductor flotante y hoja expandible Full-Screen con áreas táctiles mínimas de 48x48px.

---

## 5. Presupuesto de Rendimiento (Ultra Low-Spec - 1 GB RAM Android)

- **Streaming Fraccional por Elemento HTML5:**
  - Un único elemento `<audio preload="metadata" crossorigin="anonymous">` conectado a `AudioContext` vía `MediaElementAudioSourceNode`. Prohibido decodificar archivos enteros en memoria con `decodeAudioData`.
- **Detección Automática de Hardware (`performance.js`):**
  - Si `navigator.deviceMemory <= 2` o `hardwareConcurrency <= 4`, se activa `body.low-spec-mode`:
    - Desactiva `backdrop-filter: blur()`.
    - Limita el visualizador a 24 FPS y `devicePixelRatio = 1`.
    - Congela completamente el loop de renderizado cuando la música está pausada o la pestaña está oculta (`document.hidden`).
- **DOM Ligero:** Event Delegation global en tablas y listas para no sobrecargar el árbol de renderizado.
- **Liberación de Memoria:** Revocación sistemática de ObjectURLs temporales con `URL.revokeObjectURL()`.