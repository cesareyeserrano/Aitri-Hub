/**
 * Module: web/src/components/QaBugs
 * Purpose: QA Workspace — Bugs view (FR-022). Lists bugs from BUGS.json with
 *          severity/status filters; a per-bug detail shows description, reproduction
 *          steps, evidence and status history. A parse error is surfaced explicitly
 *          (never a silent "0 bugs"); absent and empty are distinct states.
 *
 * @aitri-trace FR-ID: FR-022, US-ID: US-022, AC-ID: AC-022-1, AC-022-2, AC-022-3, TC-ID: TC-022e, TC-022f
 */

import React, { useState, useMemo } from 'react';

const SEV_CLS = { critical: 'error', high: 'warning', medium: 'warning', low: 'dim' };

export default function QaBugs({ bugs }) {
  const [sev, setSev] = useState('all');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(null);

  const list = bugs?.bugs ?? [];
  const filtered = useMemo(
    () => list.filter((b) => (sev === 'all' || b.severity === sev) && (status === 'all' || b.status === status)),
    [list, sev, status],
  );

  if (bugs?.parseError) {
    return (
      <section className="d-section" data-testid="section-bugs">
        <h2 className="d-section__title">// bugs</h2>
        <div className="bugs-parse-error" data-testid="bugs-parse-error" role="alert">
          ⚠ BUGS.json could not be read — bugs are NOT counted. Fix the file before trusting the verdict.
        </div>
      </section>
    );
  }
  if (!bugs?.available) {
    return (
      <section className="d-section" data-testid="section-bugs">
        <h2 className="d-section__title">// bugs</h2>
        <div className="d-empty" data-testid="bugs-empty">// no bugs reported for this project</div>
      </section>
    );
  }

  return (
    <section className="d-section qa-bugs" data-testid="section-bugs">
      <h2 className="d-section__title">// bugs · {filtered.length}/{list.length}</h2>
      <div className="qa-filters">
        <label>severity
          <select value={sev} onChange={(e) => setSev(e.target.value)} data-testid="bug-filter-severity">
            <option value="all">all</option>
            {['critical', 'high', 'medium', 'low'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>status
          <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="bug-filter-status">
            <option value="all">all</option>
            {[...new Set(list.map((b) => b.status).filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <div className="bugs-empty" data-testid="bugs-none">✓ No bugs recorded for this project.</div>
      ) : filtered.length === 0 ? (
        <div className="d-empty">// no bugs match the filters</div>
      ) : (
        <ul className="bug-list">
          {filtered.map((b) => (
            <li key={b.id} className={`bug-row bug-row--${SEV_CLS[b.severity] ?? 'dim'}`} data-testid="bug-row">
              <button className="bug-row__main" onClick={() => setOpen((o) => (o === b.id ? null : b.id))} data-testid="bug-select">
                <span className="bug-row__id mono">{b.id}</span>
                <span className="bug-row__desc">{b.description}</span>
                <span className={`status-badge status-badge--${SEV_CLS[b.severity] ?? 'dim'}`}>{b.severity}</span>
                <span className="bug-row__phase mono">phase {b.phase ?? '—'}</span>
                <span className="bug-row__status mono">{b.status ?? '—'}</span>
              </button>
              {open === b.id && (
                <div className="bug-detail" data-testid="bug-detail">
                  <div className="bug-detail__desc">{b.description}</div>
                  {b.reproduction_steps && (
                    <div className="bug-detail__repro">
                      <div className="mono dim">// reproduction</div>
                      {Array.isArray(b.reproduction_steps)
                        ? <ol>{b.reproduction_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                        : <p>{b.reproduction_steps}</p>}
                    </div>
                  )}
                  {b.evidence && <div className="bug-detail__evidence mono dim">evidence: {String(b.evidence)}</div>}
                  {Array.isArray(b.history) && b.history.length > 0 && (
                    <div className="bug-detail__history">
                      <div className="mono dim">// status history</div>
                      <ul>{b.history.map((h, i) => <li key={i} className="mono">{h.at ?? ''} → {h.status ?? JSON.stringify(h)}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
