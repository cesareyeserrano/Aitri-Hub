/**
 * Module: constants
 * Purpose: Named constants for all magic numbers and configuration defaults.
 * Dependencies: none
 */

export const SCHEMA_VERSION = '1';
export const MAX_PROJECTS = parseInt(process.env.AITRI_HUB_MAX_PROJECTS ?? '50', 10);
export const REFRESH_MS        = parseInt(process.env.AITRI_HUB_REFRESH_MS        ?? '5000',  10);
export const REMOTE_REFRESH_MS = parseInt(process.env.AITRI_HUB_REMOTE_REFRESH_MS ?? '60000', 10);
export const GIT_TIMEOUT_MS = parseInt(process.env.AITRI_HUB_GIT_TIMEOUT_MS ?? '5000', 10);
export const STALE_HOURS = parseInt(process.env.AITRI_HUB_STALE_HOURS ?? '72', 10);
export const WEB_PORT = parseInt(process.env.AITRI_HUB_PORT ?? '3000', 10);
export const WEB_STARTUP_TIMEOUT_MS = 30_000;
export const WEB_POLL_INTERVAL_MS = 1_000;
export const MAX_PROJECT_NAME_LENGTH = 40;
export const PROJECT_ID_LENGTH = 8;
export const PROJECTS_FILE = 'projects.json';
export const DASHBOARD_FILE = 'dashboard.json';
export const DASHBOARD_TMP_FILE = '.dashboard.json.tmp';
export const LOG_FILE = 'logs/aitri-hub.log';
export const CACHE_DIR = 'cache';
export const TOTAL_PHASES = 5;

/**
 * Aitri Core integration gate (FR-010).
 * Bump manually after reviewing docs/integrations/CHANGELOG.md.
 * @see https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md
 */
export const INTEGRATION_LAST_REVIEWED = '0.1.76';

/** Status values for a collected project. */
export const STATUS = Object.freeze({
  HEALTHY: 'healthy',
  WARNING: 'warning',
  ERROR: 'error',
  UNREADABLE: 'unreadable',
});

/** Alert type identifiers. */
export const ALERT_TYPE = Object.freeze({
  STALE: 'stale',
  VERIFY_FAILED: 'verify-failed',
  DRIFT: 'drift',
  TESTS_FAILING: 'tests-failing',
  CACHE_STALE: 'cache-stale',
  COMPLIANCE_PARTIAL: 'compliance-partial',
  VERSION_MISMATCH: 'version-mismatch',
  REJECTION_RECENT: 'rejection-recent',
  RATE_LIMITED: 'rate-limited',
  // Git practices
  NO_BRANCH_PATTERN: 'no-branch-pattern',
  ENV_FILE_COMMITTED: 'env-file-committed',
  SECRET_IN_COMMIT: 'secret-in-commit',
  // Test quality
  FR_COVERAGE_GAP: 'fr-coverage-gap',
  HIGH_SKIP_RATE: 'high-skip-rate',
  MISSING_TEST_RESULTS: 'missing-test-results',
  // Spec quality
  SPEC_PLACEHOLDERS: 'spec-placeholders',
  // Pipeline health
  PHASE_STALLED: 'phase-stalled',
  // External tools (ESLint, npm audit, GitLeaks, etc.)
  EXTERNAL_SIGNAL: 'external-signal',
  // Bug tracking (FR-018)
  OPEN_BUGS: 'open-bugs',
});

/** Alert severity levels.
 *  BLOCKING — pipeline is stuck; user must act before work can continue.
 *  WARNING  — degraded state; should be addressed but doesn't block.
 *  INFO     — informational; no action required.
 */
export const SEVERITY = Object.freeze({
  BLOCKING: 'blocking',
  WARNING: 'warning',
  INFO: 'info',
});

/** ANSI color codes (terminal rendering). */
export const ANSI = Object.freeze({
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  CYAN: '\x1b[36m',
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
});

/** Column widths for CLI table (≥80 col mode). */
export const COL_WIDTH = Object.freeze({
  PROJECT: 22,
  PHASES: 10,
  TESTS: 13,
  COMMIT: 14,
  ALERTS: 18,
});

/** Terminal width thresholds for responsive layout. */
export const TERM_WIDTH = Object.freeze({
  FULL: 80,
  COMPACT: 60,
});
