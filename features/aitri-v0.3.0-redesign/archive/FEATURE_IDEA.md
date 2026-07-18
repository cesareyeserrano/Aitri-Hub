<!-- AGENT: if you fill this for the user, confirm the ground-truth fields
     (Problem / Why, Target Users, Success Criteria, Out of Scope) with them —
     do not silently infer. Mark anything you inferred as "[ASSUMPTION] …".
     Phase 1 records these as a provenance contract and blocks unconfirmed,
     untracked guesses on the highest-value inputs. -->

## Feature
Redesign de Aitri Hub v0.3.0 — rediseño completo de la interfaz web (Monitor + Detalle de Proyecto + módulo QA) siguiendo el discovery de UI/UX.

> **Requerimiento principal:** `feature_context/aitri-hub-ui-discovery (1).md`
> (PRD / Discovery Brief v1.0 — César Eyes, Julio 2026). Es la fuente de verdad de UI/UX.
> **Referencia visual:** `feature_context/aitri-hub-jarvis-health.jsx` y `feature_context/aitri-hub-final.jsx` (prototipos — fuente de verdad del "cómo se ve").
>
> **Alcance decidido:** este feature es UI/UX solamente. La profesionalización del Hub
> (instalable, entorno/runtime propio, upgrade de arquitectura) se aborda en un feature
> aparte y futuro (`aitri-hub-platform-upgrade`), con su propio discovery.

## Problem / Why
(Del discovery.) Un equipo que trabaja con múltiples proyectos Aitri no tiene un punto de observación unificado. Entender el estado real de un proyecto exige entrar a cada repo, revisar artefactos en raw y correr comandos en terminal. No escala, no es accesible a roles no técnicos, y no distingue visualmente un proyecto bloqueado de uno inactivo.

## Target Users
(Del discovery.) **Three Amigos** — Dev, Producto y QA — usando Hub simultáneamente, sin separación de roles ni vistas diferenciadas en esta versión. La distinción es de énfasis:
- **Dev:** monitorea avance técnico, detecta drift, retoma proyectos.
- **Producto:** sigue el pipeline de fases, revisa artefactos traducidos a lenguaje de producto, valida estado general.
- **QA:** herramienta de trabajo activa — registra pruebas, consulta casos, genera informes.

## New Behavior
El sistema debe...

**Monitor (Home)**
- Mostrar todos los proyectos en un bento grid donde el tamaño de la card refleja urgencia (CRITICAL = 2 columnas + glow/pulso, AT RISK = mediana, NOMINAL = compacta).
- Ordenar por defecto CRITICAL primero → NOMINAL al final; reordenar en cada refresh.
- En cada card: nombre legible, badge de salud, pipeline como barra segmentada, 6 tiles de señales (Tests, Drift, Verify, Commits pendientes, Señales externas, Rechazos), el issue más crítico en una línea, y acceso al detalle.
- Filtros ALL / CRITICAL / AT RISK / NOMINAL y topbar con resumen radial, conteos, ticker de sync y reloj.

**Detalle de Proyecto** (single-page, dos columnas: sidebar fijo + contenido scrolleable)
- **Overview:** descripción, pipeline fase a fase con estado visual y labels legibles, tiles de métricas, telemetría de tests con gauge.
- **Health:** 5 dimensiones (Pipeline, Tests, Code, Artifacts, Version), cada una con badge OK/WARN/CRITICAL y la acción de remediación del issue.
- **Artifacts:** árbol por fase + panel de lectura; render de Markdown formateado, JSON como vista estructurada (no raw), imágenes embebidas inline; acciones según estado (aprobar / rechazar con feedback / completar).
- **Sessions:** log cronológico de eventos del ciclo de vida + contexto de última sesión.
- **Alerts:** todos los issues activos + señales externas de tools, con estado vacío explícito.

**Módulo QA** (dentro del detalle de proyecto)
- Casos de prueba por fase/feature (desde artefactos de testing de Aitri), con filtros; los manuales editables desde Hub.
- Ejecución de pruebas manuales: resultado (pass/fail/blocked), notas, evidencia adjunta, ambiente; múltiples ejecuciones por caso en el tiempo.
- Bugs consumidos desde Aitri, con filtros y vista de detalle.
- Informes de QA (resumen de proyecto / por feature / release report), visualizados en Hub con vista imprimible desde navegador.

**Traducción de nombres de artefactos:** mostrar nombres de producto legibles (PRD, TRD, QA Plan, etc.) con el nombre técnico como referencia secundaria; misma lógica para artefactos de feature con prefijo.

**Comportamiento global:** refresh periódico con ticker (sin refresh manual en v1), estados vacíos explícitos, navegación single-page (back del browser: detalle → monitor), optimizado para desktop.

## Success Criteria
(Objetivos de la interfaz, del discovery.)
- Given el monitor, When el usuario lo abre, Then identifica el proyecto más urgente en < 10 segundos.
- Given un proyecto, When el usuario abre su detalle, Then responde "¿en qué estado quedó?" sin abrir otra herramienta.
- Given QA, When trabaja en Hub, Then puede registrar y consultar resultados de pruebas directamente.
- Given cualquier rol, When lee la UI, Then la terminología técnica de Aitri está traducida a lenguaje de producto legible.
- Given un artefacto con contenido visual, When se abre, Then se renderiza como imagen (no como texto raw).
- Given el Hub v0.3.0, When corre, Then el comportamiento existente v0.2.1 (monitoreo, snapshots) sigue funcionando.

## Touch Points
Modifica: toda la capa de UI del Hub (Monitor, Detalle, y el flujo de lectura de artefactos actual). Añade: módulo QA (casos de prueba, ejecución manual, bugs, informes), traducción de nombres, render visual de artefactos.

## Must Not Break (Regression Boundary)
- El monitoreo de proyectos por el Hub (`aitri-hub monitor`) sigue funcionando.
- La lectura/generación de snapshots y el resto del comportamiento v0.2.1 se preserva.
- La ingesta de datos desde proyectos Aitri (estado de fases, tests, artefactos) sigue produciendo los mismos datos que hoy alimentan la vista.

## Out of Scope
(Fuera de alcance v1, del discovery.)
- Separación de usuarios/roles con acceso diferenciado.
- Notificaciones push o alertas en background.
- Edición de artefactos desde Hub.
- Exportación a archivo (PDF/Markdown) — la impresión desde navegador cubre el caso.
- Soporte para proyectos que no usan Aitri.
- Autenticación o multi-tenant.
- **Profesionalización del Hub** (instalable, entorno/runtime propio, upgrade de arquitectura) → se difiere a un feature aparte (`aitri-hub-platform-upgrade`).

## Preguntas abiertas de Discovery (a resolver en Fase 1)
Las 6 preguntas de "Criterios de aceptación de Discovery" del PRD:
1. ¿Qué formato de artefacto soporta render de imágenes embebidas y qué tipos de imagen?
2. ¿El mapeo de nombre técnico → nombre de producto para artefactos de features es configurable o fijo?
3. ¿Cómo se asocia una ejecución de prueba manual a un release / iteración?
4. ¿Modelo de datos de bugs — viven en Aitri o en un sistema externo?
5. ¿El informe de QA se genera on-demand o hay un snapshot guardado?
6. ¿Qué define una "feature" — división del pipeline o concepto separado?
