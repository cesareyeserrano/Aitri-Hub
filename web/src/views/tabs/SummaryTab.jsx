/**
 * Module: web/src/views/tabs/SummaryTab
 * Purpose: Health score + phase progress + per-feature table + on-demand deploy
 *          verdict panel (validate --json, lazy) (FR-054).
 *
 * @aitri-trace FR-ID: FR-054, US-ID: US-054, AC-ID: AC-0541, AC-0542, TC-ID: TC-054h, TC-154e
 */

import React, { useState, useEffect, useCallback } from 'react';
import { healthScore, scoreGrade } from '../../lib/health.js';
import { fetchValidate } from '../../lib/detailApi.js';

const PHASE_LABEL = { 1: 'Requirements', 2: 'Design', 3: 'Tests', 4: 'Build', 5: 'Deploy' };

function VerdictPanel({ projectId, isRemote }) {
  const [state, setState] = useState({ loading: true, data: null });

  const load = useCallback(async (refresh = false) => {
    setState({ loading: true, data: null });
    const data = await fetchValidate(projectId, refresh);
    setState({ loading: false, data });
  }, [projectId]);

  useEffect(() => { load(false); }, [load]);

  if (isRemote) {
    return (
      <div className="verdict-panel" data-testid="verdict-panel">
        <div className="dim">The deploy verdict applies to local projects. Artifact tabs above read from the clone.</div>
      </div>
    );
  }

  return (
    <div className="verdict-panel" data-testid="verdict-panel">
      <div className="verdict-panel__head">
        <span className="section-title">Deploy verdict</span>
        <button className="refresh-btn" onClick={() => load(true)} data-testid="verdict-refresh">↻ refresh</button>
      </div>
      {state.loading && <div className="verdict-loading" data-testid="verdict-loading">running aitri validate…</div>}
      {!state.loading && state.data && !state.data.available && (
        <div className="verdict-degraded" data-testid="verdict-degraded">
          verdict unavailable: {state.data.reason}
        </div>
      )}
      {!state.loading && state.data?.available && state.data.report && (
        <VerdictReport report={state.data.report} />
      )}
    </div>
  );
}

function VerdictReport({ report }) {
  const deployable = report.health?.deployable ?? report.allValid ?? null;
  const reasons = report.health?.reasons ?? report.blockingReasons ?? [];
  const advisories = report.advisories ?? [];
  return (
    <div data-testid="verdict-report">
      <div className="verdict-badge" style={{ color: deployable ? 'var(--syn-green)' : 'var(--syn-red)' }}>
        {deployable ? '✓ deployable' : '✖ not deployable'}
      </div>
      {reasons.length > 0 && (
        <div className="verdict-reasons">
          <div className="dim">blocking</div>
          <ul>{reasons.map((r, i) => (
            <li key={i}>{typeof r === 'string' ? r : (r.message ?? JSON.stringify(r))}
              {r?.command && <code className="cmd">{r.command}</code>}</li>
          ))}</ul>
        </div>
      )}
      {advisories.length > 0 && (
        <div className="verdict-advisories">
          <div className="dim">advisories</div>
          <ul>{advisories.map((a, i) => (
            <li key={i}>{typeof a === 'string' ? a : (a.message ?? JSON.stringify(a))}
              {a?.command && <code className="cmd">{a.command}</code>}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

export default function SummaryTab({ payload, record }) {
  // Health score is computed from the SAME record the overview card uses
  // (FR-054 AC-1) — via the shared helper, never re-derived here.
  const score = record ? healthScore(record) : (payload.project.healthScore ?? null);
  const grade = score !== null ? scoreGrade(score) : null;
  const phases = payload.phases ?? {};
  const approved = new Set((phases.approvedPhases ?? []).map(Number));
  const completed = new Set((phases.completedPhases ?? []).map(Number));
  const drift = new Set((phases.driftPhases ?? []).map(Number));

  return (
    <div className="tab-summary" data-testid="tab-summary">
      <div className="summary-top">
        {grade && (
          <div className="health-score" data-testid="health-score">
            <span className="grade-badge" style={{ color: grade.color }}>[{grade.label}]</span>
            <span className="score-val">{score}/100</span>
          </div>
        )}
        <div className="phase-progress" data-testid="phase-progress">
          {[1, 2, 3, 4, 5].map(n => {
            const st = drift.has(n) ? 'drifted' : approved.has(n) ? 'approved' : completed.has(n) ? 'completed' : 'pending';
            const color = st === 'drifted' ? 'var(--syn-orange)'
              : st === 'approved' ? 'var(--syn-green)'
              : st === 'completed' ? 'var(--syn-teal)' : 'var(--text-dim)';
            return (
              <span key={n} className="phase-pill" style={{ color }} title={`${PHASE_LABEL[n]}: ${st}`}>
                {n}:{PHASE_LABEL[n]}
              </span>
            );
          })}
        </div>
      </div>

      {Array.isArray(payload.features) && payload.features.length > 0 && (
        <section className="feature-indicators">
          <h3 className="section-title">Features</h3>
          <table className="data-table" data-testid="feature-table">
            <thead><tr><th>feature</th><th>phase</th><th>approved</th></tr></thead>
            <tbody>
              {payload.features.map(f => (
                <tr key={f.name}>
                  <td className="mono">{f.name}</td>
                  <td>{f.currentPhase}</td>
                  <td>{(f.approvedPhases ?? []).length}/5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <VerdictPanel projectId={payload.project.id} isRemote={payload.project.type === 'remote'} />
    </div>
  );
}
