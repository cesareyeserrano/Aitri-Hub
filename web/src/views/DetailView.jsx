/**
 * Module: web/src/views/DetailView
 * Purpose: Per-project QA Workspace — header strip, scope selector, tab switch.
 *          Fetches the detail payload per scope; the header uses the freshest
 *          collected record (from the poll) to avoid split-brain (TRD risk flag).
 *
 * @aitri-trace FR-ID: FR-050, FR-051, FR-053, FR-059
 *              US-ID: US-050, US-051, US-053, US-059
 *              TC-ID: TC-050f, TC-051h, TC-053h, TC-059e
 */

import React, { useState, useEffect, useCallback } from 'react';
import { navigate } from '../lib/navigate.js';
import { fetchDetail } from '../lib/detailApi.js';
import SummaryTab from './tabs/SummaryTab.jsx';
import TestCasesTab from './tabs/TestCasesTab.jsx';
import TraceabilityTab from './tabs/TraceabilityTab.jsx';
import BugsTab from './tabs/BugsTab.jsx';
import ArtifactsTab from './tabs/ArtifactsTab.jsx';

const TABS = ['Summary', 'Test Cases', 'Traceability', 'Bugs', 'Artifacts'];

export default function DetailView({ id, record }) {
  const [scope, setScope] = useState('product');
  const [tab, setTab] = useState('Summary');
  const [state, setState] = useState({ loading: true, payload: null, error: null });

  const load = useCallback(async (wantScope) => {
    setState(s => ({ ...s, loading: true }));
    const res = await fetchDetail(id, wantScope);
    if (res.ok) setState({ loading: false, payload: res.payload, error: null });
    else setState({ loading: false, payload: null, error: res });
  }, [id]);

  useEffect(() => { load(scope); }, [load, scope]);

  const back = () => navigate('/');

  // Not-found / unreadable project (FR-050 AC-3).
  if (!state.loading && state.error && (state.error.status === 404 || state.error.status === 400)) {
    return (
      <div className="detail-view" data-testid="detail-notfound">
        <button className="back-btn" onClick={back} data-testid="detail-back">← overview</button>
        <div className="notfound-state" role="status">
          <div className="notfound-title">Project not found</div>
          <div className="dim">{state.error.error}</div>
          <button className="link-btn" onClick={back}>Return to the overview</button>
        </div>
      </div>
    );
  }

  const payload = state.payload;
  const project = payload?.project ?? { id, name: record?.name ?? id };
  const scopes = payload?.scopes ?? ['product'];

  return (
    <div className="detail-view" data-testid="detail-view">
      <div className="detail-header" data-testid="detail-header">
        <button className="back-btn" onClick={back} data-testid="detail-back">← overview</button>
        <span className="detail-name" data-testid="detail-name">{project.name}</span>
        {record?.status && (
          <span className={`status-badge status-badge--${record.status}`}>{record.status}</span>
        )}
        <span className="detail-verdict-chip" data-testid="verdict-chip">
          {tab === 'Summary' ? 'verdict on Summary' : 'not checked'}
        </span>
        <span className="detail-version mono" data-testid="detail-version">
          {project.aitriVersion ?? record?.aitriState?.aitriVersion ?? '—'}
        </span>
        <span className="detail-artdir mono dim">{project.artifactsDir ?? ''}</span>
      </div>

      {scopes.length > 1 && (
        <div className="scope-selector" data-testid="scope-selector">
          <span className="dim">scope</span>
          {scopes.map(s => (
            <button
              key={s}
              className={`scope-btn ${scope === s ? 'active' : ''}`}
              onClick={() => { setScope(s); }}
              data-testid="scope-btn"
              data-scope={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {payload?.degradation && (
        <div className="degradation-banner" data-testid="detail-degradation" role="alert">
          ⚠ snapshot degraded ({payload.degradation.reason}) — showing fallback data.
        </div>
      )}

      <nav className="tab-bar" data-testid="tab-bar">
        {TABS.map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            data-testid="tab-btn"
            data-tab={t}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="tab-panel" data-testid="tab-panel">
        {state.loading && !payload && <div className="tab-loading" data-testid="detail-loading">loading…</div>}
        {payload && tab === 'Summary' && <SummaryTab payload={payload} record={record} />}
        {payload && tab === 'Test Cases' && <TestCasesTab testCases={payload.testCases} />}
        {payload && tab === 'Traceability' && <TraceabilityTab traceability={payload.traceability} />}
        {payload && tab === 'Bugs' && <BugsTab bugs={payload.bugs} />}
        {payload && tab === 'Artifacts' && <ArtifactsTab artifacts={payload.artifacts} />}
      </div>
    </div>
  );
}
