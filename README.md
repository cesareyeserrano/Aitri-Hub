# Aitri Hub

Dashboard centralizado para monitorear múltiples proyectos gestionados con [Aitri](https://github.com/cesareyeserrano/aitri). Ofrece una vista unificada del estado de tus pipelines desde la terminal o el navegador.

## Problema que resuelve

Cuando gestionas N proyectos con Aitri, necesitas entrar en cada uno para ejecutar `aitri status`. Aitri Hub agrega todos los estados en una sola pantalla con alertas automáticas para fallos de verificación, drift de artefactos, commits estancados y tests fallidos.

## Características

- **CLI Dashboard** — Vista en terminal con auto-refresh cada 5 segundos
- **Web Dashboard** — Interfaz React accesible en `localhost:3000` vía Docker
- **Alertas automáticas** — Detecta commits estancados, fallos de verify, drift de artefactos y tests rojos
- **Zero dependencias** — El CLI no requiere dependencias npm en runtime
- **100% local** — Todos los datos se almacenan en `~/.aitri-hub/`, sin cloud

## Requisitos

| Herramienta    | Versión mínima | Necesario para     |
|----------------|----------------|--------------------|
| Node.js        | ≥18.0.0        | CLI                |
| Docker         | ≥24.0          | Web dashboard      |
| Docker Compose | ≥2.20          | Web dashboard      |
| Git            | ≥2.30          | Proyectos remotos  |

## Inicio rápido

### CLI

```bash
npm install
aitri-hub setup    # Registrar proyectos (interactivo)
aitri-hub monitor  # Iniciar dashboard en terminal
```

> **Nota:** Desde Aitri v0.1.64, `aitri init` ya no registra proyectos automáticamente en Hub.
> Hub gestiona su propio registro de proyectos en `~/.aitri-hub/projects.json`.
> Usa `aitri-hub setup` para registrar proyectos nuevos.

### Web Dashboard

```bash
docker compose up --build -d
open http://localhost:3000
```

## Comandos

| Comando                        | Descripción                              |
|--------------------------------|------------------------------------------|
| `aitri-hub init`               | Asistente de configuración inicial       |
| `aitri-hub setup`              | Registrar o actualizar proyectos         |
| `aitri-hub monitor`            | Dashboard en terminal (refresh cada 5s)  |
| `aitri-hub web`                | Iniciar web dashboard con Docker         |
| `aitri-hub help`               | Mostrar ayuda                            |
| `aitri-hub --version`          | Mostrar versión                          |

## Variables de entorno

Todas son opcionales y tienen valores por defecto:

| Variable                   | Default        | Descripción                          |
|----------------------------|----------------|--------------------------------------|
| `AITRI_HUB_DIR`            | `~/.aitri-hub` | Directorio de estado y caché         |
| `AITRI_HUB_PORT`           | `3000`         | Puerto del web dashboard             |
| `AITRI_HUB_REFRESH_MS`    | `5000`         | Intervalo de refresh del CLI (ms)    |
| `AITRI_HUB_GIT_TIMEOUT_MS`| `5000`         | Timeout para operaciones Git (ms)    |
| `AITRI_HUB_MAX_PROJECTS`  | `50`           | Máximo de proyectos registrados      |
| `AITRI_HUB_STALE_HOURS`   | `72`           | Horas para considerar commit estancado |

## Estructura del proyecto

```
bin/aitri-hub.js           # Punto de entrada CLI
lib/
  collector/               # Recolección de datos (aitri, git, tests)
  alerts/engine.js         # Motor de alertas
  renderer/cli.js          # Renderizado del dashboard en terminal
  store/                   # Gestión de projects.json y dashboard.json
  commands/                # Implementación de cada comando
web/                       # Aplicación React (Vite)
docker/                    # Dockerfile, nginx.conf, docker-compose
tests/
  unit/                    # Tests unitarios
  integration/             # Tests de integración
  e2e/                     # Tests end-to-end (Playwright)
spec/                      # Especificaciones Aitri
```

## Tests

```bash
npm test           # Unit + integration
npm run test:e2e   # End-to-end (Playwright)
npm run test:all   # Todos
```

## Arquitectura

### Modelo de integración

Hub es **read-only** sobre los proyectos Aitri. Nunca escribe en `.aitri` ni en `spec/` de ningún proyecto. Lee el estado directamente del filesystem (local) o de GitHub (remoto).

Hub gestiona su propio registro de proyectos en `~/.aitri-hub/projects.json`. Aitri Core no escribe en ese archivo. La fuente de verdad del schema que Hub lee está documentada en el repositorio de Aitri: [`docs/integrations/SCHEMA.md`](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/SCHEMA.md).

### Flujo de datos

El CLI recolecta métricas de cada proyecto (estado `.aitri`, historial Git, resultados de tests) y las escribe en `~/.aitri-hub/dashboard.json`. El web dashboard lee ese archivo vía nginx y lo muestra en una interfaz React. La comunicación entre ambos es exclusivamente por filesystem — sin IPC, sin base de datos.

```
┌──────────────┐     JSON      ┌──────────────┐
│  CLI Monitor │ ──────────▶   │ Web Dashboard │
│  (Node.js)   │  dashboard.json  │  (React/nginx) │
└──────────────┘               └──────────────┘
       │                              │
       ▼                              ▼
  .aitri files                  localhost:3000
  git history
  test results
```

## Licencia

Consulta el archivo de licencia del repositorio.
