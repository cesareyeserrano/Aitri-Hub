/**
 * Module: collector/external-signals-reader
 * Purpose: Read external tool signals from spec/06_EXTERNAL_SIGNALS.json.
 *          Hub never knows about specific tools — it reads signals and passes
 *          them through the alert engine as-is.
 * Dependencies: node:fs, node:path
 *
 * Schema (written by external tools, NOT by Aitri Core):
 * {
 *   "generatedAt": "ISO8601",          // optional — for freshness display
 *   "signals": [
 *     {
 *       "tool":     "eslint",           // required — tool name, shown in alert
 *       "type":     "code-quality",     // required — category label
 *       "severity": "warning",          // required — "blocking"|"warning"|"info"
 *       "message":  "15 lint errors",   // required — human-readable description
 *       "command":  "npm run lint"       // optional — command to resolve
 *     }
 *   ]
 * }
 *
 * File is optional. If absent or malformed: no signals, no crash.
 * Unrecognised severity values are coerced to "warning".
 */

import fs from 'node:fs';
import path from 'node:path';

const FILENAME = '06_EXTERNAL_SIGNALS.json';
const VALID_SEVERITIES = new Set(['blocking', 'warning', 'info']);

/**
 * Read and validate external signals for a project.
 * Returns { available, generatedAt, signals } — never throws.
 *
 * @param {string} projectDir
 * @param {string} artifactsDir - e.g. 'spec' or ''
 * @returns {{ available: boolean, generatedAt: string|null, signals: ExternalSignal[] }}
 */
export function readExternalSignals(projectDir, artifactsDir) {
  const base = artifactsDir ? path.join(projectDir, artifactsDir) : projectDir;
  const filePath = path.join(base, FILENAME);

  if (!fs.existsSync(filePath)) return { available: false, generatedAt: null, signals: [] };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { available: false, generatedAt: null, signals: [] };
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.signals)) {
    return { available: false, generatedAt: null, signals: [] };
  }

  const generatedAt = typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null;

  const signals = parsed.signals
    .filter(s => s && typeof s === 'object' && typeof s.message === 'string' && s.message.trim())
    .map(s => ({
      tool: typeof s.tool === 'string' ? s.tool.trim() : 'external',
      type: typeof s.type === 'string' ? s.type.trim() : 'signal',
      severity: VALID_SEVERITIES.has(s.severity) ? s.severity : 'warning',
      message: s.message.trim(),
      command: typeof s.command === 'string' ? s.command.trim() : null,
    }));

  return { available: signals.length > 0, generatedAt, signals };
}
