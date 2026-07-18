# Aitri Hub — UI Discovery Requirements

**Documento:** PRD / Discovery Brief  
**Versión:** 1.0  
**Fecha:** Julio 2026  
**Autor:** César Eyes  
**Estado:** Listo para Discovery  

---

## Contexto

Aitri es una herramienta de desarrollo guiado por specs con un pipeline de fases estructuradas. Cada proyecto Aitri genera artefactos por fase que documentan el ciclo de vida del producto: requerimientos, diseño, casos de prueba, implementación y despliegue.

Aitri Hub es la interfaz web que centraliza la visibilidad de todos los proyectos Aitri. Reemplaza la necesidad de navegar repositorios o correr comandos en terminal para entender el estado de un proyecto.

El equipo ya tiene prototipos funcionales de referencia que establecen la dirección visual y de comportamiento. Este documento define lo que debe construirse, no cómo se ve — los prototipos adjuntos responden esa pregunta.

**Referencia visual:** `aitri-hub-jarvis-health.jsx` (prototipo interactivo adjunto)

---

## Problema

Cuando un equipo trabaja con múltiples proyectos Aitri simultáneamente no tiene un punto de observación unificado. Entender el estado real de un proyecto requiere entrar a cada repositorio individualmente, revisar artefactos en formato raw y correr comandos en terminal. Esto no escala, no es accesible para roles no técnicos, y no distingue visualmente entre un proyecto bloqueado y uno simplemente inactivo.

---

## Usuarios

**Three Amigos:** Dev, Producto y QA. Los tres usan Hub simultáneamente, sin separación de roles ni vistas diferenciadas en esta versión. La distinción está en el énfasis de uso:

- **Dev** usa Hub para monitorear el avance técnico, detectar drift y retomar proyectos
- **Producto** usa Hub para seguir el pipeline de fases, revisar artefactos traducidos a lenguaje de producto y validar el estado general
- **QA** usa Hub como herramienta de trabajo activa: registra pruebas, consulta casos de prueba, genera informes

---

## Objetivos de la interfaz

1. Identificar el proyecto más urgente en menos de 10 segundos desde el monitor
2. Responder "¿en qué estado quedó este proyecto?" desde la vista de detalle, sin abrir otra herramienta
3. Permitir a QA registrar y consultar resultados de pruebas directamente en Hub
4. Traducir la terminología técnica de Aitri a lenguaje de producto legible para los tres roles
5. Renderizar contenido visual de artefactos (imágenes, wireframes, paletas) cuando el artefacto lo contiene

---

## Estructura de la aplicación

### 1. Monitor (Home)

Vista principal. Muestra todos los proyectos simultáneamente. El layout es un bento grid donde el tamaño de cada card refleja la urgencia del proyecto.

**Estados de salud:**

| Estado | Label | Comportamiento visual |
|---|---|---|
| Sin issues | NOMINAL | Card compacta, visual neutro |
| Issues no críticos | AT RISK | Card mediana, señales de advertencia |
| Issues críticos | CRITICAL | Card grande (2 columnas), glow de alerta, animación de pulso |

**Ordenamiento por defecto:** CRITICAL primero, NOMINAL al final. El orden es información.

**Cada card muestra:**

- Nombre del proyecto (en formato legible, no el nombre de archivo técnico)
- Estado de salud con badge de color
- Pipeline de fases como barra segmentada visual (sin texto de fases)
- 6 señales clave en tiles compactos con color semántico: Tests, Drift, Verify, Commits pendientes, Señales externas, Rechazos
- El issue más crítico activo en una sola línea de texto
- Botón de acceso al detalle del proyecto

**Filtros de la barra superior:** ALL / CRITICAL / AT RISK / NOMINAL  
**Topbar:** Logo con anillos animados, widget radial de resumen (proyectos nominales / total), conteo de estados, ticker de sincronización, reloj

**Comportamiento del grid:**
- Los proyectos CRITICAL ocupan 2 columnas automáticamente
- Al pasar a AT RISK o NOMINAL el grid se reajusta
- El ordenamiento se actualiza con cada refresh de datos

---

### 2. Detalle de Proyecto

Accesible desde cualquier card del monitor. Layout de dos columnas: sidebar de navegación fijo a la izquierda, contenido principal scrolleable a la derecha.

**Sidebar muestra:**
- Nombre del proyecto y estado de salud
- Branch activo y tipo (local / remote)
- Mini pipeline de fases con colores de estado
- Navegación entre secciones con badge de conteo cuando hay issues
- Quick stats: issues activos, rechazos, drift, tests

**Secciones navegables:**

#### 2.1 Overview

Resumen ejecutivo del proyecto.

- Descripción del proyecto
- Pipeline fase a fase: cada fase muestra su estado visual (aprobada, completada-pendiente-aprobación, activa, futura) con label legible — no nombres técnicos de archivo
- Métricas clave en tiles: última sesión, agente, branch, verify, commits pendientes, versión
- Telemetría de tests: passed, failing, skipped, total, antigüedad del último run — con gauge circular

#### 2.2 Health

Diagnóstico completo del proyecto dividido en cinco dimensiones. Cada dimensión tiene su estado propio y el detalle de cada issue.

| Dimensión | Qué evalúa |
|---|---|
| Pipeline | Fases completadas sin aprobar, drift entre fases |
| Tests | Tests fallando, tests stale, verify no ejecutado |
| Code | Commits sin push, cambios off-pipeline pendientes |
| Artifacts | Artefactos sin aprobar, rechazos con feedback |
| Version | Mismatch entre versión del proyecto y CLI instalado |

Cada dimensión se presenta como un panel con su badge (OK / WARN / CRITICAL) y el texto del issue cuando aplica. Los issues incluyen la acción de remediación disponible.

#### 2.3 Artifacts

Explorador de artefactos del proyecto.

**Layout:** Árbol de archivos a la izquierda, panel de lectura a la derecha.

**Árbol de archivos:**
- Agrupado por fase
- Cada fase muestra su estado con ícono (✓ aprobado, ○ pendiente, ✕ rechazado)
- Cada archivo muestra nombre legible (ver sección de traducción de nombres), tamaño y antigüedad
- El nombre técnico del archivo (ej. `01_REQUIREMENTS.json`) visible como dato secundario, no como título principal

**Panel de lectura:**
- Renderiza el contenido del artefacto seleccionado
- Para artefactos Markdown: renderizado formateado
- Para artefactos JSON: vista estructurada legible, no raw
- Para artefactos que contienen imágenes embebidas: renderizado visual inline (wireframes, paletas de color, capturas de pantalla)
- Estado del artefacto y feedback de rechazo cuando aplica
- Acción disponible según estado: aprobar, rechazar con feedback, completar

**Estados de artefactos y colores:**

| Estado | Label visible | Color |
|---|---|---|
| approved | Aprobado | Verde |
| pending_approval | Pendiente de aprobación | Amarillo |
| rejected | Rechazado | Rojo |
| in_progress | En progreso | Azul |
| pending | Sin iniciar | Gris |

#### 2.4 Sessions

Log cronológico de eventos del ciclo de vida del proyecto.

- Eventos del pipeline: aprobaciones, rechazos, completions, inicio de fases
- Cada evento muestra: tiempo relativo, tipo de evento con color, fase, feedback cuando aplica
- Contexto de la última sesión: descripción del trabajo realizado, archivos tocados, agente

#### 2.5 Alerts

Todos los issues activos del proyecto en un solo lugar.

- Issues de las cinco dimensiones de health, cada uno con label de dimensión y nivel (WARN / CRITICAL)
- Señales externas de tools (ej. `npm-audit`, `eslint`), con tipo, severidad y comando de remediación
- Estado vacío explícito cuando no hay alertas: visual de confirmación, no solo ausencia de contenido

---

### 3. Módulo QA

El módulo QA vive dentro de la vista de detalle del proyecto. Se accede desde la navegación lateral como sección adicional a las existentes.

#### 3.1 Casos de prueba

Vista de todos los casos de prueba del proyecto organizados por fase y feature.

- Los casos de prueba provienen de los artefactos de fase de testing de Aitri (generados automáticamente)
- Cada caso muestra: ID, descripción, tipo (manual / automatizado), estado (pendiente, pasado, fallido, bloqueado)
- Filtros: por fase, por feature, por estado, por tipo
- Los casos de prueba manuales pueden editarse su estado directamente desde Hub

#### 3.2 Ejecución de pruebas

Permite a QA registrar resultados de pruebas manuales.

- Selección de caso de prueba desde la lista
- Campos por ejecución: resultado (pasado / fallido / bloqueado), notas, evidencia adjunta (imagen o captura de pantalla), ambiente de prueba
- El resultado queda asociado al caso de prueba y visible en el historial
- Un caso puede tener múltiples ejecuciones en el tiempo (por release, por iteración)

#### 3.3 Bugs

Lista de bugs reportados en el proyecto, consumidos desde Aitri.

- Cada bug muestra: ID, descripción, severidad, fase donde se detectó, estado
- Filtros: por severidad, por estado, por feature
- Vista de detalle por bug: descripción completa, pasos para reproducir, evidencia adjunta, historial de cambios de estado

#### 3.4 Informes de QA

Generación y visualización de informes de calidad.

**Tipos de informe:**

| Informe | Scope | Contenido |
|---|---|---|
| Resumen de proyecto | Proyecto completo | Estado general, cobertura de pruebas, bugs por severidad, casos pasados/fallidos/pendientes |
| Informe por feature | Feature específica | Casos de prueba de la feature, resultados, bugs asociados |
| Release report | Por release o iteración | Todo lo anterior acotado a una versión específica |

**Comportamiento:**
- Los informes se visualizan dentro de Hub con formato limpio y legible
- Opción de imprimir desde el navegador (vista optimizada para impresión / PDF via browser print)
- No requiere exportación a archivo — la vista imprimible es suficiente para v1

---

## Traducción de nombres de artefactos

Aitri usa nombres técnicos de archivo para sus artefactos. Hub debe mostrar nombres de producto legibles para los tres roles. El nombre técnico permanece visible como referencia secundaria (ej. tooltip, metadata del panel de lectura).

| Nombre técnico Aitri | Nombre visible en Hub |
|---|---|
| `01_REQUIREMENTS.json` | PRD — Product Requirements |
| `02_SYSTEM_DESIGN.md` | TRD — Technical Design |
| `03_TEST_CASES.json` | QA Plan — Test Cases |
| `04_IMPLEMENTATION_MANIFEST.json` | Implementation Manifest |
| `05_PROOF_OF_COMPLIANCE.json` | Release Compliance |
| `06_EXTERNAL_SIGNALS.json` | External Signals |

Para proyectos con features, los artefactos de feature heredan la misma lógica de traducción con el prefijo del nombre de feature.

---

## Principios de diseño de la interfaz

**Señales antes que texto.** La información crítica se comunica por color, forma y posición antes que por etiquetas escritas. Un proyecto CRITICAL debe ser reconocible a distancia sin leer nada.

**Jerarquía por urgencia.** El tamaño y posición de los elementos son información, no decoración. El grid se reorganiza según el estado de salud de los proyectos.

**Accionable por defecto.** Cada issue activo lleva hacia una acción concreta: qué correr, qué aprobar, qué fase retomar. Hub no es solo observabilidad.

**Una pantalla, todo el contexto.** El detalle de un proyecto debe ser suficiente para retomarlo o para que QA ejecute una prueba, sin necesidad de abrir otra herramienta.

**Muy visual.** Los artefactos que contienen contenido visual (wireframes, paletas, diagramas, capturas) se renderizan como imágenes, no como texto. El equipo de producto y QA no debería tener que interpretar JSON o Markdown raw para entender un artefacto.

---

## Comportamiento global

**Refresh:** Los datos se sincronizan periódicamente. El topbar muestra un ticker de countdown hasta el próximo refresh. No hay refresh manual en v1.

**Estado vacío:** Cada sección con potencial de estar vacía tiene un estado explícito con instrucción de qué hacer a continuación. No hay pantallas en blanco sin contexto.

**Navegación:** La aplicación es single-page. El browser back navega de detalle a monitor. No hay rutas múltiples en v1.

**Responsive:** La aplicación está optimizada para desktop. Tablet y mobile son secundarios y pueden degradar sin romper la experiencia.

---

## Fuera de alcance — v1

- Separación de usuarios o roles con acceso diferenciado
- Notificaciones push o alertas en background
- Edición de artefactos desde Hub
- Exportación de archivos (PDF, Markdown) — la impresión desde navegador cubre el caso de uso
- Soporte para proyectos que no usan Aitri
- Autenticación o acceso multi-tenant

---

## Criterios de aceptación de Discovery

El equipo de discovery debe responder las siguientes preguntas antes de pasar a diseño:

1. ¿Qué formato de artefacto soporta el renderizado de imágenes embebidas? ¿Qué tipos de imagen son soportados?
2. ¿Cómo se define el mapeo de nombre técnico a nombre de producto para artefactos de features? ¿Es configurable o fijo?
3. ¿Cómo se asocia una ejecución de prueba manual a un release o iteración específica?
4. ¿Cuál es el modelo de datos para bugs — viven en Aitri o en un sistema externo?
5. ¿El informe de QA se genera bajo demanda o existe un snapshot guardado?
6. ¿Qué define una "feature" en el contexto del proyecto — es una división del pipeline o un concepto separado?

---

## Anexos

- `aitri-hub-jarvis-health.jsx` — Prototipo interactivo de referencia visual (monitor + detalle)
- `aitri-hub-final.jsx` — Prototipo alternativo con estructura de detalle completa
- Conversation log de sesiones de diseño iterativo (disponible bajo solicitud)
