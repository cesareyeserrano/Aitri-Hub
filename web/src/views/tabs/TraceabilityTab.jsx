/**
 * Module: web/src/views/tabs/TraceabilityTab
 * Purpose: FR→TC→result rows with uncovered-MUST pinning, coverage_map and the
 *          requirements-audit freshness stamp (FR-056).
 *
 * @aitri-trace FR-ID: FR-056, US-ID: US-056, AC-ID: AC-0561, TC-ID: TC-056h, TC-056e, TC-056f
 */

import React from 'react';
import EmptyState from '../../components/EmptyState.jsx';

const TC_COLOR = { passed: 'var(--syn-green)', failed: 'var(--syn-red)' };
const FRESH = {
  fresh: { label: 'fresh', color: 'var(--syn-green)' },
  stale: { label: 'stale', color: 'var(--syn-yellow)' },
  'not-run': { label: 'audit not run', color: 'var(--text-dim)' },
};

export default function TraceabilityTab({ traceability }) {
  if (!traceability?.available) {
    return (
      <EmptyState
        artifact="05_TRACEABILITY.json"
        command="aitri run-phase 5"
        note="Traceability is produced at Phase 5; FR coverage also derives from Phase 3/verify."
      />
    );
  }

  const { coverageMap, auditFreshness, derivedByHub } = traceability;
  const fresh = FRESH[auditFreshness] ?? FRESH['not-run'];
  // Pin uncovered MUST FRs first, defensively (the reader also sorts — this
  // keeps the component correct for any input order; FR-056).
  const frs = [...(traceability.frs ?? [])].sort((a, b) => {
    const aPin = a.priority === 'MUST' && !a.covered ? 0 : 1;
    const bPin = b.priority === 'MUST' && !b.covered ? 0 : 1;
    return aPin - bPin;
  });

  return (
    <div className="tab-traceability" data-testid="tab-traceability">
      {derivedByHub && (
        <div className="hint-banner" data-testid="derived-by-hub">
          Coverage below is <strong>computed by Hub</strong> from the test-case join
          (no fr_coverage in the results file).
        </div>
      )}

      <table className="data-table" data-testid="trace-table">
        <thead>
          <tr><th>FR</th><th>title</th><th>priority</th><th>covered</th><th>test cases</th><th>AC cov</th></tr>
        </thead>
        <tbody>
          {frs.map(fr => {
            const uncoveredMust = fr.priority === 'MUST' && !fr.covered;
            return (
              <tr key={fr.id} data-testid="trace-row" data-uncovered={uncoveredMust ? 'true' : 'false'}
                  className={uncoveredMust ? 'row-uncovered' : ''}>
                <td className="mono" id={`fr-${fr.id}`}>{fr.id}</td>
                <td>{fr.title}</td>
                <td>{fr.priority}</td>
                <td style={{ color: fr.covered ? 'var(--syn-green)' : uncoveredMust ? 'var(--syn-red)' : 'var(--text-dim)' }}>
                  {fr.covered ? '✓ covered' : uncoveredMust ? '✖ UNCOVERED' : '— none'}
                </td>
                <td className="mono">
                  {fr.tcs.length === 0
                    ? <span className="dim">no tests</span>
                    : fr.tcs.map((t, ti) => (
                        <span key={t.id ?? ti} style={{ color: TC_COLOR[t.status] ?? 'var(--text-dim)', marginRight: 6 }}>
                          {t.id}
                        </span>
                      ))}
                </td>
                <td className="mono dim">{fr.ac_coverage !== undefined ? String(fr.ac_coverage) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="trace-meta">
        <span className="freshness" data-testid="audit-freshness" style={{ color: fresh.color }}>
          requirements audit: {fresh.label}
        </span>
      </div>

      {Array.isArray(coverageMap) && coverageMap.length > 0 && (
        <section className="coverage-map" data-testid="coverage-map">
          <h3 className="section-title">Intent coverage</h3>
          <table className="data-table">
            <thead><tr><th>need</th><th>disposition</th></tr></thead>
            <tbody>
              {coverageMap.map((m, i) => (
                <tr key={i}>
                  <td>{m.need}</td>
                  <td className="mono">
                    {/^(FR|NFR)-/.test(m.disposition)
                      ? <a href={`#fr-${m.disposition}`}>{m.disposition}</a>
                      : m.disposition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
