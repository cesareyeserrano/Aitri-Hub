/**
 * Module: web/src/components/ProjectCard
 * Purpose: Project card with snapshot-derived sections per snapshot-adoption feature.
 *          Header → DEGRADATION (cond) → NEXT ACTION → DEPLOY HEALTH (cond) →
 *          BLOCKERS (cond) → PIPELINE → QUALITY → GIT → VERSION.
 *
 * @aitri-trace FR-ID: FR-012, FR-013, FR-014, FR-015, FR-016, FR-017
 *              US-ID: US-011, US-012, US-013, US-014, US-015, US-016
 *              TC-ID: TC-012h, TC-012f, TC-013h, TC-013f, TC-013e, TC-014h,
 *                     TC-014e1, TC-015h, TC-015e1, TC-016f, TC-017h, TC-S001, TC-S003
 */

import React from 'react';
import { formatLastSessionLine } from '../../../lib/collector/relative-time.js';

// ── Grade helpers ─────────────────────────────────────────────────────────────

function healthScore(project) {
  const approved = project.aitriState?.approvedPhases?.length ?? 0;
  const pipeline = Math.min(40, approved * 8);
  const ts       = project.testSummary;
  const testPts  = ts?.available && ts.total > 0 ? Math.round((ts.passed / ts.total) * 30) : 0;
  const hasBlocking = (project.alerts ?? []).some(a => a.severity === 'blocking');
  const blockPts = hasBlocking ? 0 : 20;
  const cs       = project.complianceSummary;
  const compPts  = cs?.available
    ? cs.overallStatus === 'compliant' ? 10 : cs.overallStatus === 'partial' ? 5 : 0
    : 0;
  return Math.min(100, pipeline + testPts + blockPts + compPts);
}

function scoreGrade(score) {
  if (score >= 90) return { label: 'A', color: 'var(--syn-green)' };
  if (score >= 75) return { label: 'B', color: 'var(--syn-teal)' };
  if (score >= 55) return { label: 'C', color: 'var(--syn-yellow)' };
  if (score >= 35) return { label: 'D', color: 'var(--syn-orange)' };
  return               { label: 'F', color: 'var(--syn-red)' };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatAge(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  if (hours < 1)   return `${Math.round(hours * 60)}m ago`;
  if (hours < 48)  return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ageColor(hours) {
  if (hours === null || hours === undefined) return 'var(--text-dim)';
  if (hours < 24)  return 'var(--syn-green)';
  if (hours <= 72) return 'var(--syn-yellow)';
  return 'var(--syn-red)';
}

function formatTests(ts, effectiveTotal) {
  if (!ts || !ts.available) return { label: 'N/A', pct: 0, ok: null };
  const total  = effectiveTotal ?? ts.total;
  const pct    = total > 0 ? Math.round((ts.passed / total) * 100) : 0;
  return {
    label: `${ts.passed}/${total} (${pct}%)`,
    pct,
    ok: ts.failed === 0,
    failed: ts.failed,
  };
}

function relTime(at) {
  if (!at) return null;
  const diff = Date.now() - new Date(at).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function SectionLabel({ label }) {
  return <div className="card-section__label">{label}</div>;
}

// ── DEGRADATION row (FR-017) ──────────────────────────────────────────────────

const DEGRADATION_TEXT = {
  not_installed:    'Aitri CLI not installed — limited report',
  version_too_old:  'Aitri CLI too old (need ≥0.1.77) — limited report',
  spawn_failed:     'Aitri snapshot failed — limited report',
  parse_failed:     'Aitri snapshot output unreadable — limited report',
  timeout:          'Aitri snapshot timed out — limited report',
};

function DegradationRow({ reason }) {
  if (!reason) return null;
  const text = DEGRADATION_TEXT[reason] ?? `Aitri snapshot unavailable (${reason}) — limited report`;
  return (
    <div className="degradation-warning-row" data-testid="degradation-warning-row">
      ⚠ {text}
    </div>
  );
}

// ── NEXT ACTION row (FR-012) ─────────────────────────────────────────────────

function NextActionRow({ next }) {
  if (!next) {
    return (
      <div className="next-action-row" data-testid="next-action-row">
        <span className="card-section__msg" style={{ color: 'var(--text-dim)' }}>
          No action — project idle
        </span>
      </div>
    );
  }
  const sev = next.severity === 'critical' || next.severity === 'warn' || next.severity === 'info'
    ? next.severity : 'info';
  return (
    <div
      className={`next-action-row severity-${sev}`}
      data-testid="next-action-row"
    >
      <span className="next-action-row__command" data-testid="next-action-command">
        {next.command}
      </span>
      <span className="next-action-row__reason" data-testid="next-action-reason">
        {next.reason}
      </span>
      <span
        className={`next-action-row__badge severity-${sev}`}
        data-testid="next-action-badge"
      >
        {sev}
      </span>
    </div>
  );
}

// ── DEPLOY HEALTH section (FR-013) ───────────────────────────────────────────

function DeployHealthSection({ health }) {
  if (!health || health.deployable === true) return null;
  const reasons = Array.isArray(health.deployableReasons) ? health.deployableReasons : [];
  const rows = reasons.length > 0
    ? reasons
    : [{ type: 'unknown', message: 'Project not deployable — reason unavailable' }];
  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="DEPLOY HEALTH" />
      <div className="card-section" data-testid="deploy-health-section">
        {rows.map((r, i) => (
          <div
            key={i}
            className="deploy-health-row severity-warn"
            data-testid="deploy-health-row"
            data-reason-type={r.type}
          >
            <span style={{ color: 'var(--severity-warn)' }}>⚠</span>
            <span>{r.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── BLOCKERS section (existing, plus normalize row from FR-015) ──────────────

function BlockersSection({ alerts, normalize }) {
  const blocking = (alerts ?? []).filter(a => a.severity === 'blocking');
  const warnings = (alerts ?? []).filter(a => a.severity === 'warning');
  const uncounted = Number.isInteger(normalize?.uncountedFiles) ? normalize.uncountedFiles : null;
  const showNormalize = uncounted !== null && uncounted > 0;
  if (blocking.length === 0 && warnings.length === 0 && !showNormalize) return null;
  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="BLOCKERS" />
      <div className="card-section">
        {blocking.map((a, i) => (
          <div key={`b${i}`} className="card-section__row card-section__row--blocking">
            <span style={{ color: 'var(--syn-red)' }}>✖</span>
            <span className="card-section__msg">{a.message}</span>
          </div>
        ))}
        {warnings.map((a, i) => (
          <div key={`w${i}`} className="card-section__row card-section__row--warning">
            <span style={{ color: 'var(--syn-yellow)' }}>⚠</span>
            <span className="card-section__msg">{a.message}</span>
          </div>
        ))}
        {showNormalize && (
          <div
            className="normalize-warning-row severity-warn"
            data-testid="normalize-warning-row"
          >
            {uncounted} {uncounted === 1 ? 'file' : 'files'} changed outside pipeline — run: aitri normalize
          </div>
        )}
      </div>
    </>
  );
}

// ── PIPELINE section (existing + lastSession line per FR-016) ────────────────

const PHASE_NAMES = { 1: 'Requirements', 2: 'Design', 3: 'Tests', 4: 'Implementation', 5: 'Compliance' };
const EVENT_COLOR = { approved: 'var(--syn-green)', completed: 'var(--syn-teal)', rejected: 'var(--syn-red)' };

function PipelineSection({ aitriState, lastSession }) {
  if (!aitriState) return null;
  const { approvedPhases = [], currentPhase, events = [] } = aitriState;
  const approved = approvedPhases.length;
  const pct      = Math.round((approved / 5) * 100);
  const barColor = approved === 5 ? 'var(--syn-green)' : pct >= 60 ? 'var(--syn-yellow)' : 'var(--syn-teal)';
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastSessionText = formatLastSessionLine(lastSession ?? null);
  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="PIPELINE" />
      <div className="card-section" data-testid="pipeline-section">
        <div className="card-section__row">
          <div className="pipeline-bar" aria-label={`${approved} of 5 phases`}>
            <div
              className="pipeline-bar__fill"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <span className="pipeline-bar__label">
            {approved}/5
            {currentPhase && approved < 5 && (
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', marginLeft: '6px' }}>
                Phase {currentPhase} {PHASE_NAMES[currentPhase] ?? ''}
              </span>
            )}
          </span>
        </div>
        {lastEvent && (
          <div className="card-section__row" style={{ marginTop: '4px' }}>
            <span style={{ color: EVENT_COLOR[lastEvent.event] ?? 'var(--syn-comment)', fontSize: '13px' }}>◎</span>
            <span style={{ color: EVENT_COLOR[lastEvent.event] ?? 'var(--syn-comment)', fontSize: '12px' }}>
              {lastEvent.event}
            </span>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px', marginLeft: '4px' }}>
              phase {lastEvent.phase} · {relTime(lastEvent.at)}
            </span>
          </div>
        )}
        {lastSessionText && (
          <div className="last-session-line" data-testid="last-session-line">
            {lastSessionText}
          </div>
        )}
      </div>
    </>
  );
}

// ── QUALITY section (existing + staleness indicators per FR-014) ─────────────

function StalenessIndicators({ staleVerify, audit }) {
  const verifyStale = Array.isArray(staleVerify)
    ? staleVerify.find(v => v.scope === 'root')
    : null;
  return (
    <>
      {verifyStale && (
        <span
          className="severity-warn"
          data-testid="verify-stale-indicator"
          style={{ marginLeft: '8px', fontSize: '11px' }}
        >
          verify stale ({verifyStale.days}d)
        </span>
      )}
      {audit && audit.exists === false && (
        <span
          className="severity-warn"
          data-testid="audit-missing-indicator"
          style={{ marginLeft: '8px', fontSize: '11px' }}
        >
          audit missing
        </span>
      )}
      {audit && audit.exists === true && Number.isInteger(audit.stalenessDays) && audit.stalenessDays >= 30 && (
        <span
          className="severity-warn"
          data-testid="audit-stale-indicator"
          style={{ marginLeft: '8px', fontSize: '11px' }}
        >
          audit stale ({audit.stalenessDays}d)
        </span>
      )}
    </>
  );
}

function QualitySection({ project }) {
  const { testSummary, complianceSummary, requirementsSummary, specQuality, aggregatedTcTotal, health, audit } = project;
  const effectiveTotal = aggregatedTcTotal ?? testSummary?.total ?? 0;
  const tests = formatTests(testSummary, effectiveTotal);

  const hasFrCoverage = requirementsSummary?.available;
  const hasCompliance = complianceSummary?.available;
  const hasSpecIssues = specQuality?.placeholders > 0;

  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="QUALITY" />
      <div className="card-section">
        <div className="card-section__row" data-testid="test-count-row">
          <span className="card-section__icon">◉</span>
          <span className="card-section__key">tests</span>
          <span
            className="card-section__val"
            style={{ color: tests.ok === false ? 'var(--syn-red)' : tests.ok === true ? 'var(--syn-green)' : 'var(--text-dim)' }}
          >
            Tests: {tests.label}
          </span>
          {tests.ok === false && (
            <span data-testid="blocking-badge" className="blocking-badge">{tests.failed} failing</span>
          )}
          <StalenessIndicators staleVerify={health?.staleVerify} audit={audit} />
        </div>

        {hasFrCoverage && (
          <div className="card-section__row">
            <span className="card-section__icon">◈</span>
            <span className="card-section__key">coverage</span>
            <span className="card-section__val" style={{ color: 'var(--text-dim)' }}>
              {requirementsSummary.covered ?? requirementsSummary.total}/{requirementsSummary.total} FRs covered
              {requirementsSummary.covered === requirementsSummary.total && (
                <span style={{ color: 'var(--syn-green)', marginLeft: '4px' }}>✓</span>
              )}
            </span>
          </div>
        )}

        {hasSpecIssues && (
          <div className="card-section__row">
            <span className="card-section__icon">◆</span>
            <span className="card-section__key">spec</span>
            <span className="card-section__val" style={{ color: 'var(--syn-yellow)' }}>
              ⚠ {specQuality.placeholders} placeholder{specQuality.placeholders > 1 ? 's' : ''} unresolved
            </span>
          </div>
        )}

        {hasCompliance && (() => {
          const s = complianceSummary.overallStatus;
          const cfg = s === 'compliant'
            ? { color: 'var(--syn-green)',   icon: '✓', label: 'COMPLIANT' }
            : s === 'partial'
            ? { color: 'var(--syn-yellow)',  icon: '⚠', label: 'PARTIAL' }
            : { color: 'var(--syn-comment)', icon: '·', label: 'DRAFT' };
          return (
            <div className="card-section__row">
              <span className="card-section__icon">◇</span>
              <span className="card-section__key">comply</span>
              <span className="card-section__val" style={{ color: cfg.color }}>
                {cfg.icon} {cfg.label} · {complianceSummary.levels?.production_ready ?? 0}/{complianceSummary.total} production_ready
              </span>
            </div>
          );
        })()}
      </div>
    </>
  );
}

// ── GIT section (unchanged) ───────────────────────────────────────────────────

function GitSection({ gitMeta }) {
  if (!gitMeta) return null;
  const { branch, lastCommitAgeHours, unpushedCommits, uncommittedFiles } = gitMeta;
  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="GIT" />
      <div className="card-section">
        <div className="card-section__row">
          <span className="card-section__icon">⎇</span>
          <span className="card-section__val" style={{ color: 'var(--syn-blue)' }}>
            {branch ?? 'unknown'}
          </span>
          <span style={{ color: ageColor(lastCommitAgeHours), fontSize: '11px', marginLeft: '6px' }}>
            · {formatAge(lastCommitAgeHours)}
          </span>
        </div>
        {unpushedCommits !== null && unpushedCommits > 0 && (
          <div className="card-section__row">
            <span className="card-section__icon">↑</span>
            <span className="card-section__val" style={{ color: 'var(--syn-orange)' }}>
              {unpushedCommits} commit{unpushedCommits > 1 ? 's' : ''} not pushed
            </span>
          </div>
        )}
        {uncommittedFiles !== null && uncommittedFiles > 0 && (
          <div className="card-section__row">
            <span className="card-section__icon">~</span>
            <span className="card-section__val" style={{ color: 'var(--syn-yellow)' }}>
              {uncommittedFiles} file{uncommittedFiles > 1 ? 's' : ''} uncommitted
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// ── VERSION section (unchanged) ───────────────────────────────────────────────

function VersionSection({ project }) {
  const { appVersion, aitriState } = project;
  const aitriVer = aitriState?.aitriVersion ?? null;
  if (!appVersion && !aitriVer) return null;
  return (
    <>
      <hr className="card__divider" />
      <SectionLabel label="VERSION" />
      <div className="card-section">
        {aitriVer && (
          <div className="card-section__row">
            <span className="card-section__icon" style={{ color: 'var(--syn-comment)' }}>⊙</span>
            <span className="card-section__key">aitri</span>
            <span className="card-section__val" style={{ color: 'var(--syn-teal)' }}>
              v{aitriVer}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// ── Card root ─────────────────────────────────────────────────────────────────

export default function ProjectCard({ project, animationDelay = 0 }) {
  const {
    name,
    status,
    aitriState,
    gitMeta,
    alerts,
    collectionError,
    appVersion,
    nextActions,
    health,
    audit,
    normalize,
    lastSession,
    degradationReason,
  } = project;

  const score = healthScore(project);
  const grade = scoreGrade(score);
  const blockingCount = (alerts ?? []).filter(a => a.severity === 'blocking').length;
  const next = Array.isArray(nextActions) && nextActions.length > 0 ? nextActions[0] : null;

  return (
    <div
      className="card"
      data-status={status}
      data-testid="project-card"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="card__header">
        <div className="card__header-left">
          <span className="card__name" title={name}>{name}</span>
          {appVersion && (
            <span className="card__app-version" data-testid="app-version">
              v{appVersion}
            </span>
          )}
        </div>
        <div className="card__header-right">
          {blockingCount > 0 && (
            <span
              className="blocking-badge blocking-badge--header"
              data-testid="blocking-badge"
              style={{ color: 'var(--syn-red)', marginRight: '6px', fontSize: '12px' }}
            >
              ✖ {blockingCount}
            </span>
          )}
          <span className="grade-badge" style={{ color: grade.color }} title={`Health score: ${score}`}>
            [{grade.label}]
          </span>
          <span className={`status-badge status-badge--${status}`} data-testid="status-badge">
            {status === 'healthy' ? '✓ ' : status === 'warning' ? '⚠ ' : status === 'error' ? '✖ ' : '? '}
            {status === 'unreadable' ? 'UNREADABLE' : status?.toUpperCase()}
          </span>
        </div>
      </div>

      {status === 'unreadable' ? (
        <>
          <hr className="card__divider" />
          <div className="card__error">
            <span style={{ color: 'var(--syn-comment)' }}>// </span>
            {collectionError ?? '.aitri not found or malformed'}
          </div>
        </>
      ) : (
        <>
          <DegradationRow reason={degradationReason} />
          <NextActionRow next={next} />
          <DeployHealthSection health={health} />
          <BlockersSection alerts={alerts} normalize={normalize} />
          <PipelineSection aitriState={aitriState} lastSession={lastSession} />
          <QualitySection project={project} />
          <GitSection gitMeta={gitMeta} />
          <VersionSection project={project} />
        </>
      )}
    </div>
  );
}
