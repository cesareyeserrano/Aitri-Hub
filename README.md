# Aitri Hub

Dashboard local en el navegador para monitorear múltiples proyectos gestionados con [Aitri](https://github.com/cesareyeserrano/aitri). Un solo comando (`aitri-hub web`) levanta un servidor en `localhost:3000` con la vista unificada de pipelines, actividad Git y salud de tests.

## Problema que resuelve

Cuando gestionas N proyectos con Aitri, necesitas entrar en cada uno para ejecutar `aitri status`. Aitri Hub agrega todos los estados en una sola pantalla del navegador, con alertas automáticas para fallos de verificación, drift de artefactos, commits estancados y tests fallidos.

## Características

- **Dashboard web local** — Interfaz React accesible en `localhost:3000`, sin exposición externa
- **Registro desde el navegador** — Añade, edita y elimina proyectos en `/admin`; no hay asistente de CLI
- **Alertas automáticas** — Detecta commits estancados, fallos de verify, drift de artefactos y tests rojos
- **Zero dependencias** — El CLI no requiere dependencias npm en runtime
- **100% local** — Todos los datos se almacenan en `~/.aitri-hub/`, sin cloud

## Requisitos

| Herramienta    | Versión mínima | Necesario para     |
|----------------|----------------|--------------------|
| Node.js        | ≥18.0.0        | CLI + dashboard    |
| Git            | ≥2.30          | Proyectos remotos  |

> Docker es **opcional** y sólo se usa para despliegue empaquetado. Consulta [DEPLOYMENT.md](./DEPLOYMENT.md).

## Quick Start

```bash
npm install
aitri-hub web
```

Abre [http://localhost:3000](http://localhost:3000). La primera vez que entres, el estado vacío te llevará a `/admin` para registrar tu primer proyecto.

## Comandos

| Comando                                  | Descripción                              |
|------------------------------------------|------------------------------------------|
| `aitri-hub web`                          | Inicia el dashboard en `localhost:3000`  |
| `aitri-hub integration review <version>` | Registra una revisión del CHANGELOG de Aitri |
| `aitri-hub help`                         | Muestra la ayuda                         |
| `aitri-hub --version`                    | Muestra la versión                       |

## Variables de entorno

Todas son opcionales y tienen valores por defecto:

| Variable                   | Default        | Descripción                          |
|----------------------------|----------------|--------------------------------------|
| `AITRI_HUB_DIR`            | `~/.aitri-hub` | Directorio de estado y caché         |
| `AITRI_HUB_PORT`           | `3000`         | Puerto del dashboard                 |
| `AITRI_HUB_REFRESH_MS`     | `5000`         | Intervalo de refresh del colector (ms) |
| `AITRI_HUB_GIT_TIMEOUT_MS` | `5000`         | Timeout para operaciones Git (ms)    |
| `AITRI_HUB_MAX_PROJECTS`   | `50`           | Máximo de proyectos registrados      |
| `AITRI_HUB_STALE_HOURS`    | `72`           | Horas para considerar commit estancado |

## Estructura del proyecto

```
bin/aitri-hub.js           # Punto de entrada CLI
lib/
  collector/               # Recolección de datos (aitri, git, tests)
  alerts/engine.js         # Motor de alertas
  store/                   # Gestión de projects.json y dashboard.json
  commands/                # web.js, integration-review.js
web/                       # Aplicación React (Vite) servida desde el mismo proceso
docker/                    # (Opcional) Dockerfile, nginx.conf, docker-compose
tests/
  unit/                    # Tests unitarios
  integration/             # Tests de integración
  e2e/                     # Tests end-to-end (Playwright)
spec/                      # Especificaciones Aitri
features/                  # Features dirigidos por el pipeline Aitri
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

Hub gestiona su propio registro en `~/.aitri-hub/projects.json`. Aitri Core no escribe en ese archivo. La fuente de verdad del schema que Hub lee está documentada en el repositorio de Aitri: [`docs/integrations/SCHEMA.md`](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/SCHEMA.md).

### Flujo de datos

Un único proceso Node.js sirve la SPA React **y** ejecuta el colector. La comunicación es exclusivamente por filesystem — sin IPC, sin base de datos.

```
┌─────────────────────────────────────────┐
│  aitri-hub web (proceso Node.js único)  │
│                                         │
│   ┌──────────┐     ┌─────────────────┐  │
│   │Colector  │───▶│ ~/.aitri-hub/   │  │
│   │(intervalo)│    │ dashboard.json  │  │
│   └──────────┘     │ projects.json   │  │
│                    └────────┬────────┘  │
│                             ▼           │
│   ┌────────────────────────────────┐    │
│   │  HTTP server (node:http)       │    │
│   │  · /                 → SPA     │    │
│   │  · /admin            → SPA     │    │
│   │  · /api/projects     → CRUD    │    │
│   │  · /data/*.json      → estado  │    │
│   └────────────────────────────────┘    │
└──────────────┬──────────────────────────┘
               ▼
        localhost:3000 (bind 127.0.0.1)
```

Todas las rutas `/api/*` exigen peer en loopback (`127.0.0.1` o `::1`); peticiones remotas reciben `403`.

## Licencia

Consulta el archivo de licencia del repositorio.
