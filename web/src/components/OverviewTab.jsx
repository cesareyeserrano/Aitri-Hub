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
      folder = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || 'projects');
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
            {issue.command && (
              <code className="triage__cmd">{issue.command}</code>
            )}
          </div>
        ))}
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
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <p>No projects registered.</p>
        <p>
          Run <code>aitri-hub setup</code> to add projects, then{' '}
          <code>aitri-hub monitor</code> to start collecting data.
        </p>
      </div>
    );
  }

  const healthy  = projects.filter(p => p.status === 'healthy').length;
  const warning  = projects.filter(p => p.status === 'warning').length;
  const error    = projects.filter(p => p.status === 'error' || p.status === 'unreadable').length;
  const pipeline = avgPipelinePct(projects);

  const blockingIssues = projects.flatMap(p =>
    (p.alerts ?? [])
      .filter(a => a.severity === 'blocking')
      .map(a => ({ ...a, projectName: p.name }))
  );

  const groups = groupByFolder(projects);
  const multiGroup = groups.length > 1;

  return (
    <div className="overview-tab">
      {/* ── Health summary tiles ── */}
      <div className="overview-stats">
        <StatTile label="projects"  value={projects.length} colorVar="--text" />
        <StatTile label="healthy"   value={healthy}         colorVar="--syn-green" />
        <StatTile label="warning"   value={warning}         colorVar="--syn-yellow" alert={warning > 0} />
        <StatTile label="blocking"  value={error}           colorVar="--syn-red"    alert={error > 0} />
        <StatTile label="pipeline"  value={`${pipeline}%`}  colorVar="--syn-teal" />
      </div>

      {/* ── Triage — blocking issues only ── */}
      {blockingIssues.length > 0 && (
        <TriageSection issues={blockingIssues} />
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
