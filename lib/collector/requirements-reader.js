/**
 * Module: collector/requirements-reader
 * Purpose: Read spec/01_REQUIREMENTS.json from an Aitri project directory.
 * Dependencies: node:fs, node:path
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIREMENTS_FILE = '01_REQUIREMENTS.json';

/**
 * Read and parse 01_REQUIREMENTS.json from a project directory.
 * Returns null (never throws) if the file is absent or malformed.
 *
 * @param {string} projectDir   - Absolute path to project root.
 * @param {string} [artifactsDir='spec'] - Relative path to artifacts folder.
 * @returns {RequirementsSummary | null}
 */
export function readRequirementsSummary(projectDir, artifactsDir = 'spec') {
  const filePath = path.join(projectDir, artifactsDir, REQUIREMENTS_FILE);
  if (!fs.existsSync(filePath)) return null;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  if (!parsed || !Array.isArray(parsed.functional_requirements)) return null;

  const frs = parsed.functional_requirements;
  const priority = { MUST: 0, SHOULD: 0, COULD: 0, WONT: 0 };
  for (const fr of frs) {
    const p = (fr.priority ?? '').toUpperCase();
    if (Object.hasOwn(priority, p)) priority[p]++;
  }

  return {
    available: true,
    total: frs.length,
    priority,
    projectName: typeof parsed.project_name === 'string' ? parsed.project_name : null,
  };
}
