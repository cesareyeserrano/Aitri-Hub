## Feature
Actualizar Aitri Hub para cumplir al 100% el contrato de integración Aitri ↔ Hub (v0.1.63).

## Problem / Why
El contrato de integración define el schema exacto que Hub debe leer de `.aitri`. La implementación actual de `aitri-reader.js` tiene varios gaps que causan comportamiento incorrecto:

1. **`aitriVersion` no se expone** — `readAitriState` no retorna este campo, bloqueando la alerta `VERSION_MISMATCH`.
2. **`driftPhases` ignorado** — El contrato define un fast path: leer `driftPhases[]` directamente de `.aitri`. Actualmente `detectDrift` no lo consulta en absoluto.
3. **Hash check dinámico incorrecto** — La lógica actual marca drift cuando una fase aprobada *no tiene* hash almacenado. El contrato dice lo opuesto: sin hash = fase nunca aprobada = sin drift. El check real debe leer el artifact del disco y comparar sha256 contra el hash almacenado.
4. **`artifactsDir` default equivocado** — El contrato define default `""` para proyectos adoptados. Hub actualmente defaultea a `"spec"`, lo que hace que busque artifacts en el directorio incorrecto en proyectos adoptados o pre-v0.1.20.
5. **`projectName` fallback incorrecto** — El contrato dice que si `projectName` está ausente, usar `path.basename(projectDir)`. Hub retorna `null`.
6. **Alerta `VERSION_MISMATCH` no existe** — Comparar `aitriVersion` del proyecto contra la versión del CLI instalado (`aitri --version`) y emitir alerta warning si difieren.

## Target Users
Todos los usuarios de Aitri Hub que monitorean proyectos Aitri — especialmente proyectos adoptados (pre-v0.1.20) y proyectos con drift de artifacts.

## New Behavior
- `readAitriState` debe exponer: `aitriVersion`, `updatedAt`, `createdAt` (defensivos, null si ausentes).
- `readAitriState` debe retornar `artifactsDir` como `""` cuando el campo está ausente o es string vacío (no `"spec"`).
- `readAitriState` debe retornar `projectName` como `path.basename(projectDir)` cuando el campo está ausente.
- `detectDrift` debe implementar el fast path: si `config.driftPhases` existe y contiene la fase, retornar `true`.
- `detectDrift` debe implementar el hash check dinámico: leer el artifact del disco, computar sha256, comparar contra `artifactHashes[phase]`.
- El alert engine debe emitir alerta `VERSION_MISMATCH` (severity: warning) cuando `aitriVersion` del proyecto difiere de la versión del CLI instalado.
- La detección de versión del CLI debe ser resiliente: si `aitri --version` falla, no crashear ni bloquear la colección.

## Success Criteria
- Dado un proyecto con `artifactsDir: ""` (adoptado), cuando Hub lo lee, entonces los artifacts se buscan en la raíz del proyecto (no en `spec/`).
- Dado un proyecto sin `projectName`, cuando Hub lo lee, entonces `projectName` es `path.basename(projectDir)`.
- Dado un proyecto con `driftPhases: ["2"]`, cuando Hub evalúa drift, entonces `hasDrift` es `true` sin leer archivos del disco.
- Dado un proyecto donde el artifact de fase 2 fue modificado post-aprobación (hash no coincide), cuando Hub evalúa drift, entonces `hasDrift` es `true`.
- Dado un proyecto con fase aprobada pero sin hash almacenado, cuando Hub evalúa drift, entonces `hasDrift` es `false`.
- Dado un proyecto con `aitriVersion: "0.1.50"` y CLI instalado en `0.1.63`, cuando Hub colecta, entonces se genera una alerta `VERSION_MISMATCH`.
- Dado que `aitri --version` no está disponible, cuando Hub colecta, entonces no hay crash y la alerta no se emite.

## Out of Scope
- Hub no escribe en `.aitri` ni en ningún archivo de proyecto.
- No se implementa el comando `aitri adopt --upgrade` desde Hub.
- No se agregan nuevas fuentes de datos (compliance-reader.js es trabajo separado).
- No se cambia el schema de `dashboard.json` más allá de exponer los nuevos campos del reader.
