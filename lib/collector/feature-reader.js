/**
 * Module: collector/feature-reader
 * Purpose: Scan {projectDir}/features/ subdirectories for Aitri feature sub-pipelines.
 *          Aggregates phase progress, TC count, and verify status per feature,
 *          and computes the total TC count across main + all features.
 * Dependencies: node:fs, node:path, collector/aitri-reader, store/dashboard (appendLog)
 */

import fs from 'node:fs';
import path from 'node:path';
import { readAitriState } from './aitri-reader.js';
import { readTestSummary } from './test-reader.js';
import { appendLog } from '../store/dashboard.js';

const FEATURES_DIR = 'features';
const FEATURES_CAP = 20;
const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Scan a project's features/ directory and aggregate feature pipeline data.
 * Never throws — all per-feature errors are logged and skipped.
 *
 * @aitri-trace FR-ID: FR-011, US-ID: US-011, AC-ID: AC-022, TC-ID: TC-011h
 *
 * @param {string} projectDir   Absolute path to the project root.
 * @param {number} mainTcTotal  TC count from the main pipeline (0 if unavailable).
 * @returns {{ featurePipelines: FeaturePipelineEntry[], aggregatedTcTotal: number }}
 */
export function readFeaturePipelines(projectDir, mainTcTotal) {
  const featuresDir = path.join(projectDir, FEATURES_DIR);

  if (!fs.existsSync(featuresDir)) {
    return { featurePipelines: [], aggregatedTcTotal: mainTcTotal };
  }

  let entries;
  try {
    entries = fs.readdirSync(featuresDir);
  } catch (err) {
    appendLog(`WARN feature-reader: cannot read features/ in ${projectDir} — ${err.message}`);
    return { featurePipelines: [], aggregatedTcTotal: mainTcTotal };
  }

  const featurePipelines = [];

  for (const entry of entries) {
    if (featurePipelines.length >= FEATURES_CAP) break;

    // Validate name to prevent path traversal
    if (!VALID_NAME_RE.test(entry)) {
      appendLog(`WARN feature-reader: skipping invalid feature name '${entry}' in ${projectDir}`);
      continue;
    }

    const featureDir = path.join(featuresDir, entry);

    try {
      if (!fs.statSync(featureDir).isDirectory()) continue;
    } catch {
      continue;
    }

    // readAitriState returns null for absent/malformed .aitri — skip silently
    const aitriState = readAitriState(featureDir);
    if (!aitriState) continue;

    const artifactsDir = aitriState.artifactsDir || 'spec';
    const testSummary  = readTestSummary(featureDir, artifactsDir);
    const tcCount      = testSummary?.total ?? 0;

    const verifyStatus = aitriState.verifyPassed !== undefined
      ? {
          passed:  aitriState.verifyPassed,
          summary: aitriState.verifySummary ?? null,
        }
      : null;

    featurePipelines.push({
      name:           entry,
      approvedPhases: Array.isArray(aitriState.approvedPhases) ? aitriState.approvedPhases : [],
      currentPhase:   aitriState.currentPhase ?? null,
      totalPhases:    5,
      tcCount,
      verifyStatus,
    });
  }

  featurePipelines.sort((a, b) => a.name.localeCompare(b.name));

  const featureTcSum = featurePipelines.reduce((sum, f) => sum + f.tcCount, 0);
  const aggregatedTcTotal = (mainTcTotal ?? 0) + featureTcSum;

  return { featurePipelines, aggregatedTcTotal };
}
