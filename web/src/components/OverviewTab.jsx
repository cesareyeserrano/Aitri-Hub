/**
 * Module: web/src/components/OverviewTab
 * Purpose: Overview tab — health summary tiles, blocking triage, project grid.
 * @aitri-trace FR-ID: FR-006
 */

import React from 'react';
import ProjectCard from './ProjectCard.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByFolder(projects) {
  const groups = new Map();
  for (const p of projects) {
    let folder;
    if (p.group) {
      folder = p.group;
    } else if (p.type === 'remote') {
      folder = 'remote';
    } else {
      const parts = (p.location ?? '').replace(/\/$/, '').split('/');
      folder = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || 'projects';
    }
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(p);
  }
  return [...groups.entries()].map(([folder, items]) => ({ folder, projects: items }));
}

function avgPipelinePct(projects) {
  if (projects.length === 0) return 0;
  const sum = projects.reduce((acc, p) => {
    const approved = p.aitriState?.approvedPhases?.length ?? 0;
    return acc + approved / 5;
  }, 0);
  return Math.round((sum / projects.length) * 100);
}

/**
 * Count projects per phase (1-5). Returns array of { phase, count } sorted 1→5.
 */
function phaseDistribution(projects) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of projects) {
    const phase = p.aitriState?.currentPhase;
    if (phase >= 1 && phase <= 5) counts[phase]++;
  }
  return [1, 2, 3, 4, 5].map(phase => ({ phase, count: counts[phase] }));
}

/**
 * Compute health score 0–100 for a single project.
 * - Pipeline (40pts): 8pts per approved phase
 * - Tests (30pts): pass rate × 30
 * - No blocking alerts (20pts): 20 if none, 0 otherwise
 * - Compliance (10pts): 10=compliant, 5=partial, 0=other
 */
export function healthScore(project) {
  const approved = project.aitriState?.approvedPhases?.length ?? 0;
  const pipeline = Math.min(40, approved * 8);

  const ts = project.testSummary;
  const testPts = ts?.available && ts.total > 0 ? Math.round((ts.passed / ts.total) * 30) : 0;

  const hasBlocking = (project.alerts ?? []).some(a => a.severity === 'blocking');
  const blockPts = hasBlocking ? 0 : 20;

  const cs = project.complianceSummary;
  const compPts = cs?.available
    ? cs.overallStatus === 'compliant'
      ? 10
      : cs.overallStatus === 'partial'
        ? 5
        : 0
    : 0;

  return Math.min(100, pipeline + testPts + blockPts + compPts);
}

function scoreGrade(score) {
  if (score >= 90) return { label: 'A', color: 'var(--syn-green)' };
  if (score >= 75) return { label: 'B', color: 'var(--syn-teal)' };
  if (score >= 55) return { label: 'C', color: 'var(--syn-yellow)' };
  if (score >= 35) return { label: 'D', color: 'var(--syn-orange)' };
  return { label: 'F', color: 'var(--syn-red)' };
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, colorVar, alert = false }) {
  return (
    <div className={`overview-stat ${alert ? 'overview-stat--alert' : ''}`}>
      <span className="overview-stat__value" style={{ color: `var(${colorVar})` }}>
        {value}
      </span>
      <span className="overview-stat__label">// {label}</span>
    </div>
  );
}

// ── Triage section ────────────────────────────────────────────────────────────

function TriageSection({ issues }) {
  return (
    <div className="triage">
      <div className="triage__header">
        <span className="triage__glyph">✖</span>
        <span className="triage__title">blocking — fix before continuing</span>
        <span className="triage__count">{issues.length}</span>
      </div>
      <div className="triage__rows">
        {issues.map((issue, i) => (
          <div key={i} className="triage__row">
            <span className="triage__project">{issue.projectName}</span>
            <span className="triage__arrow">→</span>
            <span className="triage__msg">{issue.message}</span>
            {issue.command && <code className="triage__cmd">{issue.command}</code>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phase distribution ────────────────────────────────────────────────────────

const PHASE_LABELS = {
  1: 'Requirements',
  2: 'Design',
  3: 'Tests',
  4: 'Implementation',
  5: 'Compliance',
};

function PhaseDistribution({ projects }) {
  const dist = phaseDistribution(projects);
  const max = Math.max(...dist.map(d => d.count), 1);
  return (
    <div className="phase-dist">
      <div className="phase-dist__header">// phase_distribution</div>
      <div className="phase-dist__bars">
        {dist.map(({ phase, count }) => (
          <div key={phase} className="phase-dist__row">
            <span className="phase-dist__label">
              P{phase} {PHASE_LABELS[phase]}
            </span>
            <div className="phase-dist__bar-wrap">
              <div
                className="phase-dist__bar"
                style={{ width: count === 0 ? '2px' : `${Math.round((count / max) * 100)}%` }}
              />
            </div>
            <span className="phase-dist__count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Health score row ──────────────────────────────────────────────────────────

function HealthScoreRow({ projects }) {
  const sorted = [...projects]
    .map(p => ({ name: p.name, score: healthScore(p) }))
    .sort((a, b) => a.score - b.score); // worst first

  return (
    <div className="health-scores">
      <div className="health-scores__header">// health_score</div>
      <div className="health-scores__rows">
        {sorted.map(({ name, score }) => {
          const grade = scoreGrade(score);
          return (
            <div key={name} className="health-scores__row">
              <span className="health-scores__grade" style={{ color: grade.color }}>
                {grade.label}
              </span>
              <span className="health-scores__name">{name}</span>
              <div className="health-scores__bar-wrap">
                <div
                  className="health-scores__bar"
                  style={{ width: `${score}%`, background: grade.color }}
                />
              </div>
              <span className="health-scores__value" style={{ color: grade.color }}>
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="card" data-status="loading">
      <div className="card__header">
        <div className="skeleton skeleton--text" style={{ width: '60%' }} />
        <div className="skeleton skeleton--pill" />
      </div>
      <hr className="card__divider" />
      <div className="card__fields">
        <div className="skeleton skeleton--bar" />
        <div className="skeleton skeleton--text" style={{ width: '80%' }} />
        <div className="skeleton skeleton--text" style={{ width: '50%' }} />
        <div className="skeleton skeleton--text" style={{ width: '65%' }} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OverviewTab({ projects, loading }) {
  if (loading) {
    return (
      <div className="project-grid">
        {[1, 2, 3].map(i => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state empty-state--onboarding">
        <h2 className="empty-state__title">No projects yet</h2>
        <p className="empty-state__body">
          Add your first project to start monitoring its pipeline, Git activity, and test health.
        </p>
        <a className="empty-state__cta" href="/admin">
          Add your first project
        </a>
        <details className="empty-state__disclosure">
          <summary>What counts as a project?</summary>
          <p>
            Any local folder that contains an <code>.aitri/</code> directory (managed by Aitri Core)
            or an Aitri-generated project snapshot. Hub reads those files read-only from{' '}
            <code>~/.aitri-hub/</code>; it never writes to the project folder itself.
          </p>
        </details>
      </div>
    );
  }

  const healthy = projects.filter(p => p.status === 'healthy').length;
  const warning = projects.filter(p => p.status === 'warning').length;
  const error = projects.filter(p => p.status === 'error' || p.status === 'unreadable').length;
  const pipeline = avgPipelinePct(projects);

  const blockingIssues = projects.flatMap(p =>
    (p.alerts ?? [])
      .filter(a => a.severity === 'blocking')
      .map(a => ({ ...a, projectName: p.name })),
  );

  const groups = groupByFolder(projects);
  const multiGroup = groups.length > 1;

  return (
    <div className="overview-tab">
      {/* ── Health summary tiles ── */}
      <div className="overview-stats">
        <StatTile label="projects" value={projects.length} colorVar="--text" />
        <StatTile label="healthy" value={healthy} colorVar="--syn-green" />
        <StatTile label="warning" value={warning} colorVar="--syn-yellow" alert={warning > 0} />
        <StatTile label="blocking" value={error} colorVar="--syn-red" alert={error > 0} />
        <StatTile label="pipeline" value={`${pipeline}%`} colorVar="--syn-teal" />
      </div>

      {/* ── Triage — blocking issues only ── */}
      {blockingIssues.length > 0 && <TriageSection issues={blockingIssues} />}

      {/* ── Phase distribution + Health scores ── */}
      {projects.length > 1 && (
        <div className="overview-insights">
          <PhaseDistribution projects={projects} />
          <HealthScoreRow projects={projects} />
        </div>
      )}

      {/* ── Project grid ── */}
      {groups.map(({ folder, projects: groupProjects }, gi) => {
        let offset = groups.slice(0, gi).reduce((s, g) => s + g.projects.length, 0);
        return (
          <div key={folder}>
            {multiGroup && (
              <div className="folder-group-header">
                <span className="folder-group-header__label">{folder}/</span>
              </div>
            )}
            <div className="project-grid">
              {groupProjects.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  animationDelay={(offset + i) * 50}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
