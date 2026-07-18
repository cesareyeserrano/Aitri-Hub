/**
 * Module: web/src/components/QaTestCases
 * Purpose: QA Workspace — Test Cases (FR-020) + manual execution recording (FR-021).
 *          Cases grouped by requirement, filterable by type/status/FR. Manual cases
 *          get an editable status (optimistic, rolls back on write error) and an
 *          inline execution form (result required; notes/environment/evidence).
 *          Automated cases are read-only (status comes from runs). Evidence is
 *          type/size validated client-side before upload (server re-validates).
 *
 * @aitri-trace FR-ID: FR-020, FR-021, US-ID: US-020, US-021, AC-ID: AC-020-2, AC-020-3, AC-021-1, AC-021-3, TC-ID: TC-020e, TC-020f, TC-021h, TC-021f
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  applyCaseFilters, groupCasesByFr, frOptions, caseType, fileToEvidence, evidenceError,
} from '../lib/qa.js';
import { fetchExecutions, postExecution, patchStatus } from '../lib/detailApi.js';

const STATUS_OPTS = ['pending', 'passed', 'failed', 'blocked'];
const RESULTS = ['passed', 'failed', 'blocked'];
const STATUS_CLS = { passed: 'healthy', failed: 'error', blocked: 'warning', pending: 'dim', skipped: 'dim' };

function ExecutionForm({ id, testCaseId, onRecorded }) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [environment, setEnvironment] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!result) { setError('Select a result before saving'); return; } // TC-E2E-003f
    const evErr = file ? evidenceError(file) : null;
    if (evErr) { setError(evErr); return; }
    setSaving(true);
    let evidence;
    try {
      if (file) evidence = await fileToEvidence(file);
    } catch {
      setSaving(false); setError('Could not read the evidence file'); return;
    }
    const res = await postExecution(id, testCaseId, { result, notes, environment, ...(evidence ? { evidence } : {}) });
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save the execution'); return; }
    setResult(''); setNotes(''); setEnvironment(''); setFile(null);
    onRecorded(res.execution);
  };

  return (
    <div className="exec-form" data-testid="exec-form">
      <div className="exec-form__row">
        <span className="exec-form__label mono">result *</span>
        <div className="exec-form__results">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              className={`result-btn ${result === r ? `result-btn--${r} active` : ''}`}
              onClick={() => setResult(r)}
              data-testid="result-btn"
              data-result={r}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <label className="exec-form__row">
        <span className="exec-form__label mono">notes</span>
        <textarea className="exec-form__input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="exec-notes" />
      </label>
      <label className="exec-form__row">
        <span className="exec-form__label mono">environment</span>
        <input className="exec-form__input" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="e.g. macOS / Chrome 120" data-testid="exec-env" />
      </label>
      <label className="exec-form__row">
        <span className="exec-form__label mono">evidence</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="exec-evidence" />
      </label>
      {error && <div className="exec-form__error" data-testid="exec-error" role="alert">⚠ {error}</div>}
      <button type="button" className="exec-form__submit" onClick={submit} disabled={saving} data-testid="exec-submit">
        {saving ? 'Saving…' : 'Save execution'}
      </button>
    </div>
  );
}

function ExecutionHistory({ executions }) {
  if (!executions.length) return <div className="d-empty" data-testid="exec-history-empty">// no executions yet</div>;
  return (
    <ul className="exec-history" data-testid="exec-history">
      {executions.slice().reverse().map((e) => (
        <li key={e.id} className="exec-item" data-testid="exec-item">
          <span className={`status-badge status-badge--${STATUS_CLS[e.result] ?? 'dim'}`}>{e.result}</span>
          <span className="exec-item__env mono">{e.environment || '—'}</span>
          <span className="exec-item__stamp mono" title={e.binding?.resultsBinding}>run {e.binding?.runStamp ?? 'unbound'}</span>
          {e.notes && <span className="exec-item__notes">{e.notes}</span>}
          {e.evidenceRef && (
            <a className="exec-item__evidence" href={`/api/project/${encodeURIComponent(e._projectId)}/evidence?ref=${encodeURIComponent(e.evidenceRef)}`} target="_blank" rel="noreferrer">evidence</a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{ id:string, testCases:object }} props
 */
export default function QaTestCases({ id, testCases }) {
  const cases = testCases?.cases ?? [];
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [fr, setFr] = useState('all');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({ loading: false, executions: [] });
  const [overrides, setOverrides] = useState({});
  const [rowError, setRowError] = useState(null);

  const filtered = applyCaseFilters(cases.map((c) => (overrides[c.id] ? { ...c, status: overrides[c.id] } : c)), { type, status, fr });
  const groups = groupCasesByFr(filtered);

  const loadHistory = useCallback(async (tcId) => {
    setHistory({ loading: true, executions: [] });
    const res = await fetchExecutions(id, tcId);
    setHistory({ loading: false, executions: (res.ok ? res.executions : []).map((e) => ({ ...e, _projectId: id })) });
  }, [id]);

  useEffect(() => { if (selected) loadHistory(selected); }, [selected, loadHistory]);

  const onSelect = (tcId) => setSelected((s) => (s === tcId ? null : tcId));

  const onStatusChange = async (c, next) => {
    setRowError(null);
    const prev = c.status;
    setOverrides((o) => ({ ...o, [c.id]: next })); // optimistic
    const res = await patchStatus(id, c.id, next);
    if (!res.ok) {
      setOverrides((o) => ({ ...o, [c.id]: prev })); // rollback
      setRowError(`${c.id}: ${res.error}`);
    }
  };

  if (!testCases?.available) {
    return (
      <section className="d-section" data-testid="section-testcases">
        <h2 className="d-section__title">// test cases</h2>
        <div className="d-empty" data-testid="testcases-empty">// no test cases yet — {testCases?.error ?? testCases?.reason ?? 'run phase 3'}</div>
      </section>
    );
  }

  return (
    <section className="d-section qa-testcases" data-testid="section-testcases">
      <h2 className="d-section__title">// test cases · {filtered.length}/{cases.length}</h2>

      <div className="qa-filters" data-testid="qa-filters">
        <label>type
          <select value={type} onChange={(e) => setType(e.target.value)} data-testid="filter-type">
            <option value="all">all</option><option value="manual">manual</option><option value="auto">auto</option>
          </select>
        </label>
        <label>status
          <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status">
            <option value="all">all</option>{STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>FR
          <select value={fr} onChange={(e) => setFr(e.target.value)} data-testid="filter-fr">
            <option value="all">all</option>{frOptions(cases).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>

      {rowError && <div className="exec-form__error" role="alert">⚠ {rowError}</div>}

      {filtered.length === 0 ? (
        <div className="d-empty">// no cases match the filters</div>
      ) : groups.map((g) => (
        <div key={g.key} className="qa-group" data-testid="qa-group">
          <div className="qa-group__head mono">{g.key}</div>
          {g.cases.map((c) => {
            const t = caseType(c);
            const st = c.status ?? 'pending';
            return (
              <div key={c.id} className="qa-case" data-testid="tc-row" data-type={t}>
                <button className="qa-case__main" onClick={() => onSelect(c.id)} data-testid="tc-select">
                  <span className="qa-case__id mono">{c.id}</span>
                  <span className="qa-case__title">{c.title}</span>
                  <span className={`badge-type badge-type--${t}`}>{t}</span>
                </button>
                {t === 'manual' ? (
                  <select
                    className="qa-case__status"
                    value={st}
                    onChange={(e) => onStatusChange(c, e.target.value)}
                    data-testid="status-select"
                  >
                    {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`status-badge status-badge--${STATUS_CLS[st] ?? 'dim'}`} title="Automated status comes from test runs" data-testid="status-auto">{st}</span>
                )}
                {selected === c.id && (
                  <div className="qa-case__detail">
                    {t === 'auto' && <div className="qa-case__hint dim" data-testid="status-hint">Automated status comes from test runs.</div>}
                    {history.loading ? <div className="d-empty">loading…</div> : <ExecutionHistory executions={history.executions} />}
                    {t === 'manual' && (
                      <ExecutionForm id={id} testCaseId={c.id} onRecorded={() => loadHistory(c.id)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
