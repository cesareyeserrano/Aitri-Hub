/**
 * Module: renderer/cli
 * Purpose: Pure function — render dashboard data as an ANSI terminal string.
 * Dependencies: constants
 */

import { ANSI, TOTAL_PHASES, STATUS } from '../constants.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function pad(s, width) {
  const visible = stripAnsi(s);
  const spaces = Math.max(0, width - visible.length);
  return s + ' '.repeat(spaces);
}

function trunc(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function formatAge(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ── Colors ────────────────────────────────────────────────────────────────────

function green(s)  { return `${ANSI.GREEN}${s}${ANSI.RESET}`; }
function yellow(s) { return `${ANSI.YELLOW}${s}${ANSI.RESET}`; }
function red(s)    { return `${ANSI.RED}${s}${ANSI.RESET}`; }
function cyan(s)   { return `${ANSI.CYAN}${s}${ANSI.RESET}`; }
function dim(s)    { return `${ANSI.DIM}${s}${ANSI.RESET}`; }
function bold(s)   { return `${ANSI.BOLD}${s}${ANSI.RESET}`; }

function colorByStatus(s, status) {
  switch (status) {
    case STATUS.HEALTHY: return green(s);
    case STATUS.WARNING: return yellow(s);
    case STATUS.ERROR:   return red(s);
    default:             return dim(s);
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

/**
 * Render a text progress bar: [████████░░░░] 65%
 * @param {number} pct  0–100
 * @param {number} width  total bar width in chars (default 20)
 */
function progressBar(pct, width = 20) {
  const safePct = Math.min(100, Math.max(0, pct || 0));
  const filled = Math.round((safePct / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);

  let colored;
  if (safePct < 30)      colored = red(bar);
  else if (safePct < 60) colored = yellow(bar);
  else if (safePct < 85) colored = cyan(bar);
  else                   colored = green(bar);

  const label = `${safePct}%`;
  return `[${colored}] ${pad(label, 4)}`;
}

// ── Status prefix ─────────────────────────────────────────────────────────────

function statusPrefix(status) {
  switch (status) {
    case STATUS.HEALTHY:    return green('●');
    case STATUS.WARNING:    return yellow('⚠');
    case STATUS.ERROR:      return red('✖');
    case STATUS.UNREADABLE: return dim('?');
    default:                return dim('·');
  }
}

function statusLabel(status) {
  switch (status) {
    case STATUS.HEALTHY:    return green('HEALTHY');
    case STATUS.WARNING:    return yellow('WARNING');
    case STATUS.ERROR:      return red('ERROR');
    case STATUS.UNREADABLE: return dim('UNREADABLE');
    default:                return dim('UNKNOWN');
  }
}

// ── Metric formatters ─────────────────────────────────────────────────────────

function fmtTests(summary) {
  if (!summary) return dim('N/A');
  const pct = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;
  const base = `${summary.passed}/${summary.total} (${pct}%)`;
  if (summary.failed > 0) return `${red(base)} ✗`;
  if (pct >= 90)          return `${green(base)} ✓`;
  return `${yellow(base)} ⚠`;
}

function fmtCommit(git) {
  if (!git || !git.isGitRepo) return dim('N/A');
  const age = formatAge(git.lastCommitAgeHours);
  const velocity = git.commitVelocity7d != null ? dim(` · ${git.commitVelocity7d} commits/7d`) : '';
  const branch   = git.branch ? dim(` · ${git.branch}`) : '';
  const stalled  = git.lastCommitAgeHours > 72 ? ` ${red('🚨 STALLED')}` : '';
  const ageColored = git.lastCommitAgeHours > 72 ? red(age)
    : git.lastCommitAgeHours > 24 ? yellow(age)
    : green(age);
  return `${ageColored}${branch}${velocity}${stalled}`;
}

function fmtPhase(state) {
  if (!state) return dim('N/A');
  const approved = state.approvedPhases?.length ?? 0;
  const current  = state.currentPhase ?? 0;
  const pct      = Math.round((approved / TOTAL_PHASES) * 100);
  const verify   = state.verifyPassed ? green(' ✓') : (state.verifySummary?.failed > 0 ? red(' ✗') : '');
  return `Phase ${current}/${TOTAL_PHASES}  ${progressBar(pct)}${verify}`;
}

// ── Card renderer ─────────────────────────────────────────────────────────────

function renderCard(project, terminalWidth) {
  const maxWidth = Math.min(terminalWidth - 4, 72);
  const divider  = dim('  ' + '─'.repeat(maxWidth));
  const indent   = '    ';

  const nameWidth = Math.max(20, maxWidth - 16);
  const name      = trunc(project.name, nameWidth).toUpperCase();
  const namePadded = pad(`  ${statusPrefix(project.status)} ${bold(name)}`, nameWidth + 10);

  const lines = [
    '',
    `${namePadded}  ${statusLabel(project.status)}`,
    divider,
    `${indent}${fmtPhase(project.aitriState)}`,
    `${indent}Tests:  ${fmtTests(project.testSummary)}`,
    `${indent}Commit: ${fmtCommit(project.gitMeta)}`,
  ];

  if (project.alerts?.length > 0) {
    const alertMsgs = project.alerts.map(a =>
      a.severity === 'error' ? red(a.message) : yellow(a.message)
    ).join(dim(' · '));
    lines.push(`${indent}Alerts: ${alertMsgs}`);
  }

  return lines.join('\n');
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Render the full CLI dashboard as a string ready for process.stdout.write().
 *
 * @aitri-trace FR-ID: FR-005, US-ID: US-005, AC-ID: AC-007, TC-ID: TC-005h
 *
 * @param {DashboardData} data
 * @param {number} [terminalWidth=80]
 * @returns {string}
 */
export function renderDashboard(data, terminalWidth = 80) {
  const projects = data.projects ?? [];
  const healthy  = projects.filter(p => p.status === STATUS.HEALTHY).length;
  const warning  = projects.filter(p => p.status === STATUS.WARNING).length;
  const error    = projects.filter(p => p.status === STATUS.ERROR || p.status === STATUS.UNREADABLE).length;

  const now      = new Date().toLocaleTimeString();
  const scanDir  = process.env.AITRI_HUB_SCAN_DIR ? dim(` · auto-scan: ${process.env.AITRI_HUB_SCAN_DIR}`) : '';
  const lines    = [ANSI.CLEAR_SCREEN];

  // Header
  const headerWidth = Math.min(terminalWidth - 2, 74);
  lines.push(`  ${bold(cyan('AITRI HUB'))}  ${dim(`↻ 5s  ${now}`)}${scanDir}`);
  lines.push(`  ${dim('─'.repeat(headerWidth))}`);
  lines.push(
    `  ${green('●')} ${green(String(healthy))} healthy  ` +
    `${yellow('⚠')} ${yellow(String(warning))} warning  ` +
    `${red('✖')} ${red(String(error))} error  ` +
    dim(`│  ${projects.length} project${projects.length !== 1 ? 's' : ''}`)
  );

  if (projects.length === 0) {
    lines.push('');
    lines.push(`  ${dim("No projects found. Run 'aitri-hub setup' or set AITRI_HUB_SCAN_DIR.")}`);
    lines.push('');
    lines.push(`  ${dim('Press Ctrl+C to exit')}`);
    return lines.join('\n');
  }

  // Project cards
  for (const p of projects) {
    lines.push(renderCard(p, terminalWidth));
  }

  lines.push('');
  lines.push(`  ${dim('Press Ctrl+C to exit')}`);
  return lines.join('\n');
}
