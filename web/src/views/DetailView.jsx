/**
 * Module: web/src/views/DetailView
 * Purpose: v0.3.0 Project Detail shell — a single-page, fixed-sidebar view over one
 *          project. The sidebar (name + health, branch/type, mini pipeline, section
 *          nav with issue-count badges, quick stats) stays fixed while the content
 *          column scrolls. Core sections (Overview, Health, Sessions, Alerts) derive
 *          purely from the polled dashboard.json `record` via lib/detail.js; the
 *          Artifacts and QA sections consume the on-demand detail payload.
 *          Browser Back returns to the Monitor with the prior filter preserved
 *          (History API — lib/navigate.js). A removed project renders an explicit
 *          not-found panel rather than crashing.
 *
 * @aitri-trace FR-ID: FR-012, FR-013, FR-014, FR-017, FR-018, FR-019
 *              US-ID: US-012, US-013, US-014, US-017, US-018, US-019
 *              AC-ID: AC-012-1, AC-012-2, AC-012-3
 *              TC-ID: TC-012e, TC-012f, TC-STAT-012h
 */

import React, { useState, useEffect, useCallback } from 'react';
import { navigate } from '../lib/navigate.js';
import { fetchDetail } from '../lib/detailApi.js';
import {
  buildSidebar,
  buildOverview,
  buildHealthPanels,
  buildSessions,
  buildAlerts,
} from '../lib/detail.js';
import ArtifactsTab from './tabs/ArtifactsTab.jsx';
import TestCasesTab from './tabs/TestCasesTab.jsx';
import BugsTab from './tabs/BugsTab.jsx';

const URGENCY_META = Object.freeze({
  error: { label: 'CRITICAL', glyph: '✕', cls: 'error' },
  unreadable: { label: 'CRITICAL', glyph: '✕', cls: 'error' },
  warning: { label: 'AT RISK', glyph: '⚠', cls: 'warning' },
  healthy: { label: 'NOMINAL', glyph: '✓', cls: 'healthy' },
});

const BADGE_META = Object.freeze({
  OK: { glyph: '✓', cls: 'healthy' },
  WARN: { glyph: '⚠', cls: 'warning' },
  CRITICAL: { glyph: '✕', cls: 'error' },
});

// Core sections derive from the polled record; QA/artifact sections use the payload.
const CORE_SECTIONS = ['overview', 'health', 'artifacts', 'sessions', 'alerts'];
const QA_SECTIONS = ['testcases', 'bugs'];
const SECTION_LABEL = Object.freeze({
  overview: 'Overview',
  health: 'Health',
  artifacts: 'Artifacts',
  sessions: 'Sessions',
  alerts: 'Alerts',
  testcases: 'Test Cases',
  bugs: 'Bugs',
});

/** Relative-age string for an epoch/ISO timestamp; '—' when absent. */
function ageOf(at) {
  if (!at) return '—';
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(t)) return String(at);
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Circular pass-ratio gauge (SVG) for the Overview telemetry. */
function Gauge({ ratio }) {
  const pct = Math.round(ratio * 100);
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone = ratio >= 1 ? 'healthy' : ratio >= 0.8 ? 'warning' : 'error';
  return (
    <svg className="gauge" width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${pct}% passing`}>
      <circle cx="44" cy="44" r={r} className="gauge__track" fill="none" strokeWidth="8" />
      <circle
        cx="44" cy="44" r={r} fill="none" strokeWidth="8"
        className={`gauge__fill gauge__fill--${tone}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" className="gauge__label">{pct}%</text>
    </svg>
  );
}

/** Overview — description, phase pipeline (readable labels + state), metric tiles, telemetry gauge. */
function OverviewSection({ record }) {
  const { phases, telemetry, gauge, tiles } = buildOverview(record);
  const tileRows = [
    ['last session', ageOf(tiles.last_session)],
    ['agent', tiles.agent ?? '—'],
    ['branch', tiles.branch ?? '—'],
    ['verify', tiles.verify],
    ['pending commits', tiles.pending_commits == null ? 'N/A' : String(tiles.pending_commits)],
    ['version', tiles.version ?? '—'],
  ];
  return (
    <section className="d-section" data-testid="section-overview">
      <h2 className="d-section__title">// overview</h2>
      {record?.description && <p className="d-section__desc">{record.description}</p>}

      <div className="d-phases" data-testid="overview-phases">
        {phases.map((p) => (
          <div key={p.n} className={`d-phase d-phase--${p.state}`} title={p.state}>
            <span className="d-phase__n">{p.n}</span>
            <span className="d-phase__label">{p.label}</span>
            <span className="d-phase__state">{p.state}</span>
          </div>
        ))}
      </div>

      <div className="d-tiles">
        {tileRows.map(([k, v]) => (
          <div key={k} className="d-tile">
            <span className="d-tile__key mono">{k}:</span>
            <span className="d-tile__val mono">{v}</span>
          </div>
        ))}
      </div>

      <div className="d-telemetry" data-testid="overview-telemetry">
        {telemetry.state === 'no-run-yet' ? (
          <div className="d-telemetry__norun" data-testid="overview-norun">// no verify run yet</div>
        ) : (
          <div className="d-telemetry__has-run">
            {gauge && <Gauge ratio={gauge.ratio} />}
            <div className="d-telemetry__counts mono">
              <div><span className="color--healthy">{telemetry.passed}</span> passed</div>
              <div><span className={telemetry.failing ? 'color--error' : 'color--dim'}>{telemetry.failing}</span> failing</div>
              <div><span className="color--dim">{telemetry.skipped}</span> skipped</div>
              <div><span className="color--info">{telemetry.total}</span> total</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Health — five fixed diagnostic dimensions, each with an OK/WARN/CRITICAL badge + remediations. */
function HealthSection({ record }) {
  const panels = buildHealthPanels(record);
  return (
    <section className="d-section" data-testid="section-health">
      <h2 className="d-section__title">// health · 5 dimensions</h2>
      <div className="d-health">
        {panels.map((panel) => {
          const meta = BADGE_META[panel.badge] ?? BADGE_META.OK;
          return (
            <div key={panel.dimension} className={`d-panel d-panel--${meta.cls}`} data-testid="health-panel">
              <div className="d-panel__head">
                <span className="d-panel__dim">{panel.dimension}</span>
                <span className={`status-badge status-badge--${meta.cls}`}>{meta.glyph} {panel.badge}</span>
              </div>
              {panel.issues.length === 0 ? (
                <div className="d-panel__ok color--dim">✓ All checks passing</div>
              ) : (
                <ul className="d-panel__issues">
                  {panel.issues.map((iss, i) => (
                    <li key={i} className="d-issue">
                      <span className="d-issue__msg">{iss.message}</span>
                      {iss.remediation && <code className="d-issue__fix mono">{iss.remediation}</code>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Sessions — chronological lifecycle timeline (newest-first) + last-session context. */
function SessionsSection({ record }) {
  const { timeline, context, state } = buildSessions(record);
  return (
    <section className="d-section" data-testid="section-sessions">
      <h2 className="d-section__title">// sessions</h2>
      {state === 'empty' ? (
        <div className="d-empty" data-testid="sessions-empty">// no sessions yet</div>
      ) : (
        <ul className="d-timeline">
          {timeline.map((e, i) => (
            <li key={i} className={`d-event d-event--${e.event}`}>
              <span className="d-event__time mono">{ageOf(e.at)}</span>
              <span className="d-event__type">{e.event}</span>
              {e.phase != null && <span className="d-event__phase mono">phase {e.phase}</span>}
              {e.feedback && <span className="d-event__feedback">“{e.feedback}”</span>}
            </li>
          ))}
        </ul>
      )}
      {context && (
        <div className="d-lastsession" data-testid="sessions-context">
          <div className="d-lastsession__head mono">// last session</div>
          {context.description && <p className="d-lastsession__desc">{context.description}</p>}
          <div className="d-lastsession__meta">
            {context.agent && <span className="chip mono">agent: {context.agent}</span>}
            {context.files.map((f) => (
              <span key={f} className="chip mono">{f}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Alerts — health issues + external tool signals aggregated; all-clear when empty. */
function AlertsSection({ record }) {
  const { cards, state } = buildAlerts(record);
  if (state === 'all-clear') {
    return (
      <section className="d-section" data-testid="section-alerts">
        <h2 className="d-section__title">// alerts</h2>
        <div className="d-allclear" data-testid="alerts-allclear">✓ All systems nominal</div>
      </section>
    );
  }
  return (
    <section className="d-section" data-testid="section-alerts">
      <h2 className="d-section__title">// alerts · {cards.length}</h2>
      <div className="d-alerts">
        {cards.map((c, i) => (
          <div key={i} className={`d-alert d-alert--${c.severity ?? 'info'}`} data-testid="alert-card">
            <span className="d-alert__label">{c.label}</span>
            <span className="d-alert__sev mono">{c.severity ?? 'info'}</span>
            <span className="d-alert__msg">{c.message}</span>
            {c.command && <code className="d-alert__cmd mono">→ {c.command}</code>}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * @param {{ id:string, record:object|null, loading:boolean }} props
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-012-3, TC-ID: TC-012f
 */
export default function DetailView({ id, record, loading = false }) {
  const [section, setSection] = useState('overview');
  const [detail, setDetail] = useState({ loading: true, payload: null, error: null });

  const back = useCallback(() => navigate('/'), []);

  const loadDetail = useCallback(async () => {
    setDetail((s) => ({ ...s, loading: true }));
    const res = await fetchDetail(id, 'product');
    if (res.ok) setDetail({ loading: false, payload: res.payload, error: null });
    else setDetail({ loading: false, payload: null, error: res });
  }, [id]);

  // Only fetch the on-demand payload when an artifact/QA section is open (lazy).
  useEffect(() => {
    if ([...QA_SECTIONS, 'artifacts'].includes(section) && !detail.payload && !detail.error) {
      loadDetail();
    }
  }, [section, detail.payload, detail.error, loadDetail]);

  // Removed / unknown project → explicit not-found panel (never a crash or blank page).
  if (!loading && !record) {
    return (
      <div className="detail-view" data-testid="detail-notfound">
        <button className="back-btn" onClick={back} data-testid="detail-back">‹ Mission Control</button>
        <div className="notfound-state" role="status">
          <div className="notfound-title">Project not found — it may have been removed</div>
          <button className="link-btn" onClick={back}>Back to Monitor</button>
        </div>
      </div>
    );
  }

  if (!record) {
    return <div className="detail-view" data-testid="detail-loading"><div className="d-empty">loading…</div></div>;
  }

  const sidebar = buildSidebar(record);
  const meta = URGENCY_META[record.status] ?? URGENCY_META.healthy;
  const git = record.gitMeta || {};
  const st = record.aitriState || {};
  const approved = Array.isArray(st.approvedPhases) ? st.approvedPhases.length : 0;
  const badgeFor = (name) => sidebar.nav.find((n) => n.section === name)?.badge ?? 0;

  return (
    <div className="detail-shell" data-testid="detail-view">
      <aside className="d-sidebar" data-testid="detail-sidebar">
        <button className="back-btn" onClick={back} data-testid="detail-back">‹ Mission Control</button>

        <div className="d-sidebar__id">
          <span className="d-sidebar__name" data-testid="detail-name">{record.name}</span>
          <span className={`status-badge status-badge--${meta.cls}`}>{meta.glyph} {meta.label}</span>
        </div>

        <div className="d-sidebar__meta mono">
          <div>{git.branch ?? '—'} · {record.type === 'remote' ? 'remote' : 'local'}</div>
        </div>

        <div className="phase-bar d-sidebar__pipeline" aria-label={`${approved} of 5 phases approved`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`phase-segment ${i < approved ? 'phase-segment--approved' : ''}`} />
          ))}
        </div>

        <nav className="d-nav" data-testid="detail-nav">
          {CORE_SECTIONS.map((s) => (
            <button
              key={s}
              className={`d-nav__item ${section === s ? 'active' : ''}`}
              onClick={() => setSection(s)}
              data-testid="nav-item"
              data-section={s}
            >
              <span>{SECTION_LABEL[s]}</span>
              {badgeFor(s) > 0 && <span className="d-nav__badge" data-testid={`badge-${s}`}>{badgeFor(s)}</span>}
            </button>
          ))}
          <div className="d-nav__group mono">// QA</div>
          {QA_SECTIONS.map((s) => (
            <button
              key={s}
              className={`d-nav__item ${section === s ? 'active' : ''}`}
              onClick={() => setSection(s)}
              data-testid="nav-item"
              data-section={s}
            >
              <span>{SECTION_LABEL[s]}</span>
            </button>
          ))}
        </nav>

        <div className="d-quickstats" data-testid="detail-quickstats">
          <div className="d-quickstats__row"><span className="mono">issues</span><span>{sidebar.quickStats.issues}</span></div>
          <div className="d-quickstats__row"><span className="mono">rejections</span><span>{sidebar.quickStats.rejections}</span></div>
          <div className="d-quickstats__row"><span className="mono">drift</span><span>{sidebar.quickStats.drift}</span></div>
          <div className="d-quickstats__row"><span className="mono">tests</span><span>{sidebar.quickStats.tests}</span></div>
        </div>
      </aside>

      <div className="d-content" data-testid="detail-content">
        {section === 'overview' && <OverviewSection record={record} />}
        {section === 'health' && <HealthSection record={record} />}
        {section === 'sessions' && <SessionsSection record={record} />}
        {section === 'alerts' && <AlertsSection record={record} />}

        {(section === 'artifacts' || QA_SECTIONS.includes(section)) && (
          <>
            {detail.loading && !detail.payload && <div className="d-empty" data-testid="detail-loading">loading…</div>}
            {detail.error && (
              <div className="d-empty" data-testid="detail-error">// could not load: {detail.error.error}</div>
            )}
            {detail.payload && section === 'artifacts' && <ArtifactsTab artifacts={detail.payload.artifacts} />}
            {detail.payload && section === 'testcases' && <TestCasesTab testCases={detail.payload.testCases} />}
            {detail.payload && section === 'bugs' && <BugsTab bugs={detail.payload.bugs} />}
          </>
        )}
      </div>
    </div>
  );
}
