/**
 * Module: web/src/components/QaReports
 * Purpose: QA Workspace — quality reports (FR-023). Renders an on-demand projection
 *          (project / per-feature / release) from the current snapshot: coverage,
 *          bugs-by-severity, case pass/fail/pending. Browser print produces a
 *          print-optimized layout (nav chrome hidden via @media print). No file export.
 *
 * @aitri-trace FR-ID: FR-023, US-ID: US-023, AC-ID: AC-023-1, AC-023-2, AC-023-4, TC-ID: TC-023e
 */

import React, { useState, useEffect, useCallback } from 'react';
import { fetchReport } from '../lib/detailApi.js';

const SEVS = ['critical', 'high', 'medium', 'low'];

/**
 * @param {{ id:string, scopes?:string[] }} props
 */
export default function QaReports({ id, scopes = ['product'] }) {
  const [scope, setScope] = useState('project');
  const [state, setState] = useState({ loading: true, report: null, error: null });

  const load = useCallback(async (s) => {
    setState({ loading: true, report: null, error: null });
    const res = await fetchReport(id, s);
    if (res.ok) setState({ loading: false, report: res.report, error: null });
    else setState({ loading: false, report: null, error: res.error });
  }, [id]);

  useEffect(() => { load(scope); }, [load, scope]);

  const features = scopes.filter((s) => s !== 'product');

  return (
    <section className="d-section qa-reports" data-testid="section-reports">
      <div className="qa-reports__toolbar" data-testid="report-toolbar">
        <h2 className="d-section__title">// quality report</h2>
        <div className="qa-reports__controls">
          <select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="report-scope">
            <option value="project">Project summary</option>
            {features.map((f) => <option key={f} value={`feature:${f}`}>Feature — {f}</option>)}
          </select>
          <button className="link-btn" onClick={() => window.print()} disabled={state.loading} data-testid="report-print-btn">Print</button>
        </div>
      </div>

      {state.loading && <div className="d-empty">Generating…</div>}
      {state.error && <div className="d-empty" data-testid="report-error">// could not build report: {state.error}</div>}
      {state.report && (
        <div className="report-print" data-testid="report-print">
          {state.report.empty ? (
            <div className="d-empty" data-testid="report-empty">// no data in this scope yet</div>
          ) : (
            <>
              <div className="report__head">
                <span className="report__project">{state.report.project?.name ?? id}</span>
                <span className="report__scope mono">{state.report.scope}</span>
              </div>

              <div className="report__grid">
                <div className="report__card" data-testid="report-coverage">
                  <div className="report__card-title mono">// coverage</div>
                  <div className="report__big">{state.report.coverage.coveragePct == null ? 'N/A' : `${state.report.coverage.coveragePct}%`}</div>
                  <div className="report__counts mono">
                    <span className="color--healthy">{state.report.coverage.passed} passed</span>
                    <span className="color--error">{state.report.coverage.failed} failed</span>
                    <span className="color--warning">{state.report.coverage.pending} pending</span>
                    <span className="color--dim">{state.report.coverage.total} total</span>
                  </div>
                </div>

                <div className="report__card" data-testid="report-bugs">
                  <div className="report__card-title mono">// bugs by severity</div>
                  <div className="report__sev">
                    {SEVS.map((s) => (
                      <div key={s} className="report__sev-row">
                        <span className="mono">{s}</span>
                        <span className="report__sev-count">{state.report.bugsBySeverity[s] ?? 0}</span>
                      </div>
                    ))}
                    <div className="report__sev-row report__sev-row--total">
                      <span className="mono">total</span><span>{state.report.bugsTotal}</span>
                    </div>
                  </div>
                </div>

                <div className="report__card" data-testid="report-executions">
                  <div className="report__card-title mono">// manual executions</div>
                  <div className="report__big">{state.report.executionsCount}</div>
                  <div className="report__counts mono color--dim">recorded this scope</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
