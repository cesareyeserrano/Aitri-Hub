/**
 * Module: collector/detail-reader
 * Purpose: Build the on-demand QA-Workspace detail payload for one project +
 *          scope (product or a feature sub-pipeline), reading ONLY whitelisted
 *          artifact filenames through the rc.159 confinement helpers.
 * Dependencies: node:fs, node:path, node:crypto, collector/aitri-reader
 *
 * Every section degrades independently: absent artifact → { available:false },
 * malformed artifact → { available:false, error:'<file>' }. readDetail never
 * throws (FR-059).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readAitriState, resolveArtifact } from './aitri-reader.js';

/** Max bytes served per artifact content (TRD Data Model size guard). */
const MAX_ARTIFACT_BYTES = 1024 * 1024;

/** Scope names must be plain identifiers — never path fragments (FR-052). */
const SCOPE_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Confine a resolved directory to the project root, following symlinks (NFR-045).
 * Returns the resolved absolute path when it stays inside `root` (by realpath of
 * the deepest existing ancestor, so a not-yet-created dir does not throw), or
 * null when it escapes — via `..` traversal in `artifactsDir` OR a symlinked
 * feature dir whose target is outside the root (both are real vectors for
 * cloned remote repos, where `.aitri`/symlinks are attacker-controlled).
 *
 * @aitri-trace FR-ID: FR-052, US-ID: US-052, AC-ID: AC-0522, TC-ID: TC-052e
 * @param {string} root - Project root (already resolved).
 * @param {string} candidate - Absolute path to confine.
 * @returns {string|null}
 */
function confineToRoot(root, candidate) {
  const resolved = path.resolve(candidate);
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    return null;
  }
  // Lexical containment first (cheap; catches `..`).
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  // Symlink containment: realpath the deepest existing ancestor.
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    const probeReal = fs.realpathSync(probe);
    if (probeReal !== rootReal && !probeReal.startsWith(rootReal + path.sep)) return null;
  } catch {
    return null;
  }
  return resolved;
}

/**
 * The ONLY filenames this module ever opens (TRD API Design). Legacy aliases
 * are reached through resolveArtifact, not by widening this list.
 */
const CHAIN = Object.freeze([
  { name: '00_DISCOVERY.md', kind: 'md' },
  { name: '01_UX_SPEC.md', kind: 'md' },
  { name: '01_REQUIREMENTS.json', kind: 'json' },
  { name: '02_SYSTEM_DESIGN.md', kind: 'md' },
  { name: '03_TEST_CASES.json', kind: 'json' },
  { name: '04_BUILD_REPORT.json', kind: 'json' },
  { name: '04_CODE_REVIEW.md', kind: 'md' },
  { name: '04_TEST_RESULTS.json', kind: 'json' },
  { name: '05_TRACEABILITY.json', kind: 'json' },
  { name: 'AUDIT_REPORT.md', kind: 'md' },
]);
const OFF_CHAIN = Object.freeze([{ name: 'BUGS.json', kind: 'json' }]);

/**
 * Read one whitelisted artifact. Returns { present, raw?, parsed?, truncated?,
 * error? } and never throws.
 *
 * @aitri-trace FR-ID: FR-052, US-ID: US-052, AC-ID: AC-0522, TC-ID: TC-152e
 * @param {string} baseDir - Scope's artifact base directory.
 * @param {{name:string, kind:string}} entry - Whitelist entry.
 * @returns {object}
 */
function readArtifactEntry(baseDir, entry) {
  const filePath = resolveArtifact(baseDir, entry.name);
  if (!fs.existsSync(filePath)) return { present: false };
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { present: true, error: entry.name };
  }
  const truncated = Buffer.byteLength(raw, 'utf8') > MAX_ARTIFACT_BYTES;
  if (truncated) raw = raw.slice(0, MAX_ARTIFACT_BYTES);
  if (entry.kind === 'json' && !truncated) {
    try {
      return { present: true, parsed: JSON.parse(raw.replace(/^\uFEFF/, '')), raw };
    } catch {
      return { present: true, error: entry.name, raw };
    }
  }
  return { present: true, raw, ...(truncated ? { truncated: true } : {}) };
}

/**
 * Join 03_TEST_CASES.json with 04_TEST_RESULTS.json into per-TC rows.
 *
 * @aitri-trace FR-ID: FR-055, US-ID: US-055, AC-ID: AC-0551, TC-ID: TC-055h
 */
function buildTestCases(tcArt, resArt) {
  if (!tcArt.present) return { available: false, reason: '03_TEST_CASES.json' };
  if (tcArt.error) return { available: false, error: tcArt.error };
  const cases = Array.isArray(tcArt.parsed?.test_cases) ? tcArt.parsed.test_cases : null;
  if (!cases) return { available: false, error: '03_TEST_CASES.json' };

  const byId = new Map();
  if (resArt.present && !resArt.error && Array.isArray(resArt.parsed?.results)) {
    for (const r of resArt.parsed.results) {
      if (typeof r?.tc_id === 'string') byId.set(r.tc_id, r);
    }
  }
  const summary = { passed: 0, failed: 0, pending: 0, skipped: 0, manual: 0 };
  const rows = cases.map(tc => {
    const res = byId.get(tc.id) ?? null;
    const manual = tc.automation === 'manual';
    let status = res?.status ?? 'pending';
    if (status === 'pass') status = 'passed';
    if (status === 'fail') status = 'failed';
    // Core's results enum includes 'manual' — surface it as pending so the row,
    // the summary bucket and the status filter agree (automation already says
    // 'manual'; a recorded-but-unverified manual TC is pending coverage).
    if (status === 'manual') status = 'pending';
    if (manual && !res) status = 'pending';
    if (manual) summary.manual += 1;
    if (status === 'passed') summary.passed += 1;
    else if (status === 'failed') summary.failed += 1;
    else if (status === 'skipped' || status === 'skip') summary.skipped += 1;
    else summary.pending += 1;
    return {
      id: tc.id ?? null,
      title: tc.title ?? '',
      automation: manual ? 'manual' : 'auto',
      ...(manual && typeof tc.manual_reason === 'string' ? { manual_reason: tc.manual_reason } : {}),
      scenario: tc.scenario ?? null,
      status: status === 'skip' ? 'skipped' : status,
      ...(res?.evidence ? { evidence: res.evidence } : {}),
      ...(res?.downgraded_from ? { downgraded_from: res.downgraded_from } : {}),
      requirement_id: tc.requirement_id ?? (Array.isArray(tc.frs) ? tc.frs.join(',') : null),
      ...(tc.ac_id ? { ac_id: tc.ac_id } : {}),
    };
  });
  return {
    available: true,
    cases: rows,
    summary,
    resultsPresent: resArt.present === true && !resArt.error,
  };
}

/**
 * Build the traceability section: FR rows with coverage + coverage_map +
 * requirements-audit freshness.
 *
 * @aitri-trace FR-ID: FR-056, US-ID: US-056, AC-ID: AC-0561, TC-ID: TC-056h, TC-056e
 */
function buildTraceability(reqArt, trcArt, resArt, testCases, rawState) {
  if (!reqArt.present || reqArt.error) {
    return { available: false, reason: '01_REQUIREMENTS.json', frs: [] };
  }
  const frs = Array.isArray(reqArt.parsed?.functional_requirements)
    ? reqArt.parsed.functional_requirements
    : [];

  // Prefer the spine's fr_coverage; else derive from the TC join and say so.
  const coverageById = new Map();
  let derivedByHub = false;
  if (resArt.present && !resArt.error && Array.isArray(resArt.parsed?.fr_coverage)) {
    for (const c of resArt.parsed.fr_coverage) {
      if (typeof c?.fr_id === 'string') coverageById.set(c.fr_id, c);
    }
  } else if (testCases.available) {
    derivedByHub = true;
    for (const row of testCases.cases) {
      const ids = typeof row.requirement_id === 'string' ? row.requirement_id.split(',') : [];
      for (const id of ids) {
        const cur = coverageById.get(id) ?? { fr_id: id, tests_passing: 0, tests_failing: 0 };
        if (row.status === 'passed') cur.tests_passing += 1;
        if (row.status === 'failed') cur.tests_failing += 1;
        coverageById.set(id, cur);
      }
    }
  }

  const acCoverage = resArt.present && !resArt.error ? (resArt.parsed?.ac_coverage ?? null) : null;
  const tcsByFr = new Map();
  if (testCases.available) {
    for (const row of testCases.cases) {
      const ids = typeof row.requirement_id === 'string' ? row.requirement_id.split(',') : [];
      for (const id of ids) {
        if (!tcsByFr.has(id)) tcsByFr.set(id, []);
        tcsByFr.get(id).push({ id: row.id, status: row.status });
      }
    }
  }

  const rows = frs.map(fr => {
    const cov = coverageById.get(fr.id) ?? null;
    const covered = cov ? (cov.status ? cov.status === 'covered' : cov.tests_passing > 0) : false;
    return {
      id: fr.id,
      title: fr.title ?? '',
      priority: fr.priority ?? null,
      covered,
      tcs: tcsByFr.get(fr.id) ?? [],
      ...(acCoverage && acCoverage[fr.id] !== undefined ? { ac_coverage: acCoverage[fr.id] } : {}),
    };
  });
  // Uncovered MUST FRs pinned first (FR-056).
  rows.sort((a, b) => {
    const aPin = a.priority === 'MUST' && !a.covered ? 0 : 1;
    const bPin = b.priority === 'MUST' && !b.covered ? 0 : 1;
    return aPin - bPin;
  });

  // Requirements-audit freshness: raw sha256 of the requirements file vs the
  // stamp Aitri stores at audit time. A formatting-only rewrite can read as
  // 'stale' (Core normalizes; we do not replicate normalization) — the honest
  // failure direction: never 'fresh' when content actually changed.
  // BG-015: an audit timestamp WITHOUT a hash stamp (pre-rc.154 projects) is
  // unverifiable — report 'unknown', never overstate 'fresh'.
  let auditFreshness = 'not-run';
  if (rawState?.coverageAuditLastAt) {
    if (typeof rawState.coverageAuditReqHash !== 'string') {
      auditFreshness = 'unknown';
    } else {
      const reqHash = crypto.createHash('sha256').update(reqArt.raw ?? '').digest('hex');
      auditFreshness = rawState.coverageAuditReqHash !== reqHash ? 'stale' : 'fresh';
    }
  }

  return {
    available: true,
    frs: rows,
    derivedByHub,
    coverageMap: Array.isArray(reqArt.parsed?.coverage_map) ? reqArt.parsed.coverage_map : null,
    auditFreshness,
    traceabilityPresent: trcArt.present === true && !trcArt.error,
  };
}

/**
 * Build the bugs section with the absent / empty / corrupt trichotomy.
 *
 * @aitri-trace FR-ID: FR-057, US-ID: US-057, AC-ID: AC-0571, AC-0572, TC-ID: TC-057h, TC-057e, TC-057f
 */
function buildBugs(bugsArt) {
  if (!bugsArt.present) return { available: false, parseError: false };
  if (bugsArt.error || !Array.isArray(bugsArt.parsed?.bugs)) {
    return { available: false, parseError: true };
  }
  const isBlocking = b =>
    (b.severity === 'critical' || b.severity === 'high') &&
    b.status !== 'closed' &&
    b.status !== 'verified';
  const bugs = bugsArt.parsed.bugs.map(b => ({
    id: b.id ?? null,
    title: b.title ?? '',
    severity: b.severity ?? null,
    status: b.status ?? null,
    blocking: isBlocking(b),
    ...(typeof b.resolution === 'string' ? { resolution: b.resolution } : {}),
    ...(Array.isArray(b.files_changed) ? { files_changed: b.files_changed } : {}),
    ...(typeof b.tc_id === 'string' ? { tc_id: b.tc_id } : {}),
  }));
  bugs.sort((a, b) => (a.blocking === b.blocking ? 0 : a.blocking ? -1 : 1));
  return { available: true, parseError: false, bugs };
}

/**
 * Lightweight raw .aitri read for audit-freshness fields (same tolerant shape
 * as collector/index readAitriRaw; file-or-directory form, BOM-stripped).
 */
function readRawState(dir) {
  let filePath = path.join(dir, '.aitri');
  try {
    if (!fs.existsSync(filePath)) return null;
    if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'config.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

/**
 * Resolve the confined artifact base directory for a project + scope. Shared by
 * readDetail and readArtifactContent so both apply the SAME confinement.
 *
 * @param {string} projectDir - Resolved local project dir.
 * @param {string|undefined} scope - 'product' (or undefined) or a feature name.
 * @returns {{ok:true, state:object, wanted:string, scopes:string[], baseDir:string, scopeStateDir:string, root:string} | {ok:false, code:number, error:string}}
 */
function resolveScopeBase(projectDir, scope) {
  const state = readAitriState(projectDir);
  if (!state) return { ok: false, code: 404, error: 'project state unreadable (.aitri missing or malformed)' };

  const featureNames = state.features.map(f => f.name);
  const scopes = ['product', ...featureNames];
  const wanted = scope === undefined || scope === '' || scope === 'product' ? 'product' : scope;
  if (wanted !== 'product') {
    if (!SCOPE_RE.test(wanted) || !featureNames.includes(wanted)) {
      return { ok: false, code: 400, error: `invalid scope: ${String(scope).slice(0, 80)}` };
    }
  }

  // Scope base: product → projectDir + artifactsDir (root-relative, includes
  // the contained layout per SCHEMA.md); feature → its dir under layoutBase.
  // Both artifactsDir (untrusted `.aitri`) and the feature dir (potential
  // symlink in a cloned remote repo) are confined to the project root — an
  // escape is a 400, not an out-of-root read (adversarial findings #2/#3).
  const root = path.resolve(projectDir);
  let baseDir;
  let scopeStateDir;
  if (wanted === 'product') {
    baseDir = state.artifactsDir ? path.join(projectDir, state.artifactsDir) : projectDir;
    scopeStateDir = projectDir;
  } else {
    const featDir = path.join(state.layoutBase, 'features', wanted);
    if (!confineToRoot(root, featDir)) {
      return { ok: false, code: 400, error: `scope escapes project root: ${wanted}` };
    }
    const featState = readAitriState(featDir);
    const featArtifactsDir = featState?.artifactsDir || 'spec';
    baseDir = path.join(featDir, featArtifactsDir);
    scopeStateDir = featDir;
  }
  if (!confineToRoot(root, baseDir)) {
    return { ok: false, code: 400, error: 'artifacts directory escapes project root' };
  }
  return { ok: true, state, wanted, scopes, baseDir, scopeStateDir, root };
}

/** Phase each known artifact belongs to (FR-015 tree grouping). 0 = cross-cutting/Other. */
const ARTIFACT_PHASE = Object.freeze({
  '00_DISCOVERY.md': 1, '01_UX_SPEC.md': 1, '01_REQUIREMENTS.json': 1,
  '02_SYSTEM_DESIGN.md': 2,
  '03_TEST_CASES.json': 3,
  '04_BUILD_REPORT.json': 4, '04_CODE_REVIEW.md': 4, '04_TEST_RESULTS.json': 4,
  '05_TRACEABILITY.json': 5,
  'AUDIT_REPORT.md': 0, 'BUGS.json': 0,
});
const PHASE_LABELS = Object.freeze({
  1: 'Requirements', 2: 'Architecture', 3: 'Test Cases', 4: 'Implementation', 5: 'Compliance', 0: 'Other',
});
/** Worst-first status precedence for a phase folder's rolled-up glyph. */
const STATUS_RANK = Object.freeze({ rejected: 0, pending: 1, approved: 2 });
const STATUS_GLYPH = Object.freeze({ approved: '✓', pending: '○', rejected: '✕', empty: '∅' });

/** The phase number a rejection targets, or null. Reads the untrusted `.aitri` shape defensively. */
function rejectionPhase(state) {
  const r = state && state.lastRejection;
  if (r && typeof r === 'object' && Number.isInteger(r.phase)) return r.phase;
  return null;
}

/**
 * Status of a phase's artifacts, derived from the pipeline state: rejected (a
 * rejection targets it) > pending (completed-not-approved, or not yet reached) >
 * approved. Non-color-safe callers add an icon/label (FR-015).
 * @param {object} state
 * @param {number} phaseNum
 * @returns {'approved'|'pending'|'rejected'}
 */
function phaseArtifactStatus(state, phaseNum) {
  if (phaseNum === 0) return 'approved'; // cross-cutting docs carry no phase gate
  const approved = Array.isArray(state.approvedPhases) ? state.approvedPhases : [];
  const completed = Array.isArray(state.completedPhases) ? state.completedPhases : [];
  if (rejectionPhase(state) === phaseNum) return 'rejected';
  if (approved.includes(phaseNum)) return 'approved';
  if (completed.includes(phaseNum)) return 'pending';
  return 'pending';
}

/**
 * Build the per-phase artifact tree (FR-015): each phase folder lists its present
 * files with status/size/mtime and a rolled-up glyph = worst child status. Phases
 * with no present artifact still appear with an explicit empty state.
 * @param {object} state
 * @param {string} baseDir - Confined scope base.
 * @param {object} art - Map of name → readArtifactEntry result.
 * @returns {Array<{phase:number,label:string,status:string,glyph:string,files:object[]}>}
 */
function buildArtifactTree(state, baseDir, art) {
  const phases = [1, 2, 3, 4, 5, 0];
  return phases.map(phaseNum => {
    const names = Object.keys(ARTIFACT_PHASE).filter(n => ARTIFACT_PHASE[n] === phaseNum);
    const files = [];
    for (const name of names) {
      const a = art[name];
      if (!a || a.present !== true) continue;
      let size = null;
      let mtime = null;
      try {
        const st = fs.statSync(resolveArtifact(baseDir, name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch { /* stat may race a delete; leave null */ }
      files.push({
        technicalName: name,
        kind: name.endsWith('.json') ? 'json' : 'md',
        status: phaseArtifactStatus(state, phaseNum),
        size,
        mtime,
        ...(a.error ? { error: true } : {}),
      });
    }
    // Fold Other into the tree only when it has files.
    const worst = files.length
      ? files.reduce((w, f) => (STATUS_RANK[f.status] < STATUS_RANK[w] ? f.status : w), 'approved')
      : 'empty';
    return { phase: phaseNum, label: PHASE_LABELS[phaseNum], status: worst, glyph: STATUS_GLYPH[worst], files };
  }).filter(group => group.phase !== 0 || group.files.length > 0);
}

/** Image extensions the reader serves inline (FR-016), mapped to MIME. */
const IMAGE_MIME = Object.freeze({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
});

/**
 * Read one artifact's CONTENT by a client-supplied relative path, for the reader
 * (FR-016). Markdown → raw text; JSON → parsed projection; image → base64 data-URI
 * (SVG served as a data-URI, never inline unsanitized markup). The path is confined
 * to the scope base with the SAME control as the tree (`..`/absolute/symlink escape
 * → 403). Never throws.
 *
 * @aitri-trace FR-ID: FR-016, US-ID: US-016, AC-ID: AC-016-1, TC-ID: TC-016h, TC-016f, TC-PATH-016f
 * @param {{id:string}} projectEntry
 * @param {string} projectDir
 * @param {string|undefined} scope
 * @param {string} relPath - Client-supplied path relative to the scope base.
 * @returns {{ok:true, content:object} | {ok:false, code:number, error:string, errorCode?:string}}
 */
export function readArtifactContent(projectEntry, projectDir, scope, relPath) {
  const base = resolveScopeBase(projectDir, scope);
  if (!base.ok) return base;

  if (typeof relPath !== 'string' || relPath === '') {
    return { ok: false, code: 400, error: 'missing path', errorCode: 'bad_request' };
  }
  // Absolute paths and traversal are rejected outright (defence in depth; the
  // realpath confinement below is the authoritative control).
  if (path.isAbsolute(relPath)) {
    return { ok: false, code: 403, error: 'path escapes project root', errorCode: 'confinement' };
  }
  const candidate = path.resolve(base.baseDir, relPath);
  if (!confineToRoot(base.baseDir, candidate)) {
    return { ok: false, code: 403, error: 'path escapes project root', errorCode: 'confinement' };
  }
  if (!fs.existsSync(candidate)) {
    return { ok: false, code: 404, error: 'artifact not found', errorCode: 'not_found' };
  }
  let stat;
  try {
    stat = fs.statSync(candidate);
  } catch {
    return { ok: false, code: 404, error: 'artifact not found', errorCode: 'not_found' };
  }
  if (!stat.isFile()) {
    return { ok: false, code: 404, error: 'not a file', errorCode: 'not_found' };
  }
  if (stat.size > MAX_ARTIFACT_BYTES) {
    return { ok: false, code: 413, error: 'artifact too large', errorCode: 'too_large' };
  }

  const ext = path.extname(candidate).toLowerCase();
  const meta = { size: stat.size, mtime: stat.mtimeMs, path: relPath };

  if (IMAGE_MIME[ext]) {
    let buf;
    try {
      buf = fs.readFileSync(candidate);
    } catch {
      return { ok: false, code: 404, error: 'artifact unreadable', errorCode: 'not_found' };
    }
    const dataUri = `data:${IMAGE_MIME[ext]};base64,${buf.toString('base64')}`;
    return { ok: true, content: { kind: 'image', dataUri, meta } };
  }

  let raw;
  try {
    raw = fs.readFileSync(candidate, 'utf8');
  } catch {
    return { ok: false, code: 404, error: 'artifact unreadable', errorCode: 'not_found' };
  }
  if (ext === '.json') {
    try {
      return { ok: true, content: { kind: 'json', parsed: JSON.parse(raw.replace(/^\uFEFF/, '')), meta } };
    } catch {
      // Surface the parse error honestly rather than dumping raw as if structured.
      return { ok: true, content: { kind: 'json', parseError: true, raw, meta } };
    }
  }
  if (ext === '.md' || ext === '.markdown') {
    return { ok: true, content: { kind: 'markdown', content: raw, meta } };
  }
  return { ok: true, content: { kind: 'other', content: raw, meta } };
}

/**
 * Build the full detail payload for one project + scope.
 *
 * @aitri-trace FR-ID: FR-052, FR-053, FR-059, US-ID: US-052, US-053, US-059, AC-ID: AC-0521, AC-0531, AC-0591, TC-ID: TC-053h, TC-053e, TC-053f, TC-059h, TC-059f
 * @param {{id:string,name:string,type:string,location:string}} projectEntry - Registry entry.
 * @param {string} projectDir - Resolved local dir (registry/local or remote cache).
 * @param {string|undefined} scope - 'product' (or undefined) or a feature name.
 * @param {object|null} record - The project's last collected dashboard record (may be null).
 * @returns {{ok:true, payload:object} | {ok:false, code:number, error:string}}
 */
export function readDetail(projectEntry, projectDir, scope, record) {
  const base = resolveScopeBase(projectDir, scope);
  if (!base.ok) return base;
  const { state, wanted, scopes, baseDir, scopeStateDir } = base;

  const art = {};
  for (const entry of [...CHAIN, ...OFF_CHAIN]) art[entry.name] = readArtifactEntry(baseDir, entry);

  const testCases = buildTestCases(art['03_TEST_CASES.json'], art['04_TEST_RESULTS.json']);
  const traceability = buildTraceability(
    art['01_REQUIREMENTS.json'],
    art['05_TRACEABILITY.json'],
    art['04_TEST_RESULTS.json'],
    testCases,
    readRawState(scopeStateDir),
  );
  const bugs = buildBugs(art['BUGS.json']);

  const contents = {};
  for (const entry of CHAIN) {
    const a = art[entry.name];
    if (!a.present || a.error) continue;
    contents[entry.name] = entry.kind === 'md'
      ? { kind: 'md', raw: a.raw, ...(a.truncated ? { truncated: true } : {}) }
      : { kind: 'json', parsed: a.parsed };
  }

  return {
    ok: true,
    payload: {
      detailVersion: 1,
      project: {
        id: projectEntry.id,
        name: record?.name ?? state.projectName,
        type: projectEntry.type,
        location: projectEntry.location,
        aitriVersion: state.aitriVersion,
        artifactsDir: state.artifactsDir,
        status: record?.status ?? null,
        healthScore: record?.healthScore ?? null,
      },
      scopes,
      scope: wanted,
      testCases,
      traceability,
      bugs,
      artifacts: {
        chain: CHAIN.map(e => ({
          name: e.name,
          present: art[e.name].present === true,
          kind: e.kind,
          ...(art[e.name].error ? { error: true } : {}),
          ...(art[e.name].truncated ? { truncated: true } : {}),
        })),
        // Per-phase tree for the redesigned Artifacts explorer (FR-015).
        tree: buildArtifactTree(state, baseDir, art),
        contents,
      },
      phases: record?.aitriState
        ? { currentPhase: record.aitriState.currentPhase, approvedPhases: record.aitriState.approvedPhases, completedPhases: record.aitriState.completedPhases, driftPhases: record.aitriState.driftPhases }
        : { currentPhase: state.currentPhase, approvedPhases: state.approvedPhases, completedPhases: state.completedPhases, driftPhases: state.driftPhases },
      features: state.features,
      degradation: record?.degradationReason ? { reason: record.degradationReason } : null,
    },
  };
}
