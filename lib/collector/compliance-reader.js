/**
 * Module: collector/compliance-reader
 * Purpose: Read the Phase-5 traceability artifact (05_TRACEABILITY.json, rc.41 name;
 *          pre-rc.41 05_PROOF_OF_COMPLIANCE.json via legacy alias) from an Aitri project.
 * Dependencies: node:fs, node:path, collector/aitri-reader (resolveArtifact)
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from './aitri-reader.js';

const COMPLIANCE_FILE = '05_TRACEABILITY.json';

const VALID_LEVELS = [
  'production_ready',
  'complete',
  'partial',
  'functionally_present',
  'placeholder',
];

/**
 * Read and parse 05_PROOF_OF_COMPLIANCE.json from a project directory.
 * Returns null (never throws) if the file is absent, malformed, or Phase 5 not yet run.
 *
 * @param {string} projectDir  - Absolute path to project root.
 * @param {string} [artifactsDir='spec'] - Relative path to artifacts folder (from .aitri config).
 * @returns {ComplianceSummary | null}
 */
export function readComplianceSummary(projectDir, artifactsDir = 'spec') {
  /** @aitri-trace FR-ID: FR-041, US-ID: US-041, AC-ID: AC-0411, AC-0412, TC-ID: TC-041h */
  const filePath = resolveArtifact(path.join(projectDir, artifactsDir), COMPLIANCE_FILE);
  if (!fs.existsSync(filePath)) return null;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.overall_status || !Array.isArray(parsed.requirement_compliance)) return null;

  // Count entries by level
  const levels = { production_ready: 0, complete: 0, partial: 0, functionally_present: 0 };
  for (const entry of parsed.requirement_compliance) {
    if (VALID_LEVELS.includes(entry.level) && entry.level !== 'placeholder') {
      if (Object.hasOwn(levels, entry.level)) levels[entry.level]++;
    }
  }

  return {
    available: true,
    overallStatus: parsed.overall_status, // 'compliant' | 'partial' | 'draft'
    levels,
    total: parsed.requirement_compliance.length,
  };
}
