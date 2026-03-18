/**
 * Module: web/src/components/FRCoverageTab
 * Purpose: FR coverage view — which functional requirements have test coverage,
 *          which are partial, and which have none. Per project breakdown.
 * @aitri-trace FR-ID: FR-007
 */

import React, { useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_ORDER = { missing: 0, partial: 1, covered: 2 };
const STATUS_CFG = {
  covered: { label: 'covered', color: 'var(--syn-green)',   glyph: '✓' },
  partial: { label: 'partial', color: 'var(--syn-yellow)',  glyph: '◑' },
  missing: { label: 'no tests', color: 'var(--syn-red)',    glyph: '✖' },
};

function buildSummary(frCoverage) {
  const covered = frCoverage.filter(f => f.status === 'covered').length;
  const partial = frCoverage.filter(f => f.status === 'partial').length;
  const missing = frCoverage.filter(f => f.status === 'missing' || f.status === 'none').length;
  const total   = frCoverage.length;
  const pct     = total > 0 ? Math.round((covered / total) * 100) : 0;
  return { covered, partial, missing, total, pct };
}

// ── FR row ────────────────────────────────────────────────────────────────────

function FRRow({ fr }) {
  const status = fr.status === 'none' ? 'missing' : fr.status;
  const cfg    = STATUS_CFG[status] ?? STATUS_CFG.missing;
  return (
    <div className={`fr-row fr-row--${status}`}>
      <span className="fr-row__glyph" style={{ color: cfg.color }}>{cfg.glyph}</span>
      <span className="fr-row__id">{fr.frId}</span>
      <span className="fr-row__status" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  );
}

// ── Project coverage block ────────────────────────────────────────────────────

function ProjectCoverage({ project }) {
  const [expanded, setExpanded] = useState(false);
  const frCoverage = project.testSummary?.frCoverage ?? [];
  if (frCoverage.length === 0) return null;

  const { covered, partial, missing, total, pct } = buildSummary(frCoverage);
  const sorted = [...frCoverage].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)
  );

  const barColor = pct >= 90 ? 'var(--syn-green)'
    : pct >= 60 ? 'var(--syn-yellow)'
    : 'var(--syn-red)';

  return (
    <div className="fr-project">
      <button className="fr-project__header" onClick={() => setExpanded(e => !e)}>
        <span className="fr-project__toggle">{expanded ? '▾' : '▸'}</span>
        <span className="fr-project__name">{project.name}</span>
        <div className="fr-project__bar-wrap">
          <div className="fr-project__bar" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <span className="fr-project__pct" style={{ color: barColor }}>{pct}%</span>
        <span className="fr-project__stats">
          <span style={{ color: 'var(--syn-green)' }}>{covered} ✓</span>
          {partial > 0 && <span style={{ color: 'var(--syn-yellow)' }}> · {partial} ◑</span>}
          {missing > 0 && <span style={{ color: 'var(--syn-red)' }}> · {missing} ✖</span>}
          <span style={{ color: 'var(--text-muted)' }}> / {total}</span>
        </span>
      </button>

      {expanded && (
        <div className="fr-project__rows">
          {sorted.map(fr => <FRRow key={fr.frId} fr={fr} />)}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FRCoverageTab({ projects }) {
  const withCoverage = projects.filter(p => (p.testSummary?.frCoverage?.length ?? 0) > 0);

  // Portfolio summary
  const allFRs    = withCoverage.flatMap(p => p.testSummary.frCoverage);
  const covered   = allFRs.filter(f => f.status === 'covered').length;
  const partial   = allFRs.filter(f => f.status === 'partial').length;
  const missing   = allFRs.filter(f => f.status === 'missing' || f.status === 'none').length;
  const total     = allFRs.length;
  const totalPct  = total > 0 ? Math.round((covered / total) * 100) : 0;

  if (withCoverage.length === 0) {
    return (
      <div className="alerts-tab">
        <div className="alerts-log-header">
          <span className="alerts-log-header__file">// fr_coverage</span>
          <span className="alerts-log-header__sep" />
          <span className="alerts-log-header__meta">no coverage data available</span>
        </div>
        <div className="alerts-empty">
          <span>No FR coverage data found. Run phase 3 and verify to generate 04_TEST_RESULTS.json.</span>
        </div>
      </div>
    );
  }

  const barColor = totalPct >= 90 ? 'var(--syn-green)'
    : totalPct >= 60 ? 'var(--syn-yellow)'
    : 'var(--syn-red)';

  return (
    <div className="alerts-tab">
      {/* ── Header ── */}
      <div className="alerts-log-header">
        <span className="alerts-log-header__file">// fr_coverage</span>
        <span className="alerts-log-header__sep" />
        <span className="alerts-log-header__meta">
          {covered}/{total} covered · {partial} partial · {missing} missing · {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* ── Portfolio bar ── */}
      <div className="fr-portfolio">
        <div className="fr-portfolio__bar-wrap">
          <div className="fr-portfolio__bar" style={{ width: `${totalPct}%`, background: barColor }} />
        </div>
        <div className="fr-portfolio__stats">
          <span style={{ color: 'var(--syn-green)',  fontWeight: 600 }}>✓ {covered} covered</span>
          <span style={{ color: 'var(--syn-yellow)' }}>◑ {partial} partial</span>
          <span style={{ color: 'var(--syn-red)'   }}>✖ {missing} no tests</span>
          <span style={{ color: 'var(--text-muted)' }}>/ {total} total FRs · {totalPct}% coverage</span>
        </div>
      </div>

      {/* ── Per project ── */}
      <div className="fr-projects">
        {withCoverage.map(p => <ProjectCoverage key={p.id} project={p} />)}
      </div>
    </div>
  );
}
