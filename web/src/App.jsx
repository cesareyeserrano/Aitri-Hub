/**
 * Module: web/src/App
 * Purpose: Root component — polls /data/dashboard.json every 5s, manages connection state,
 *          renders tab navigation and active view.
 *
 * @aitri-trace FR-ID: FR-006, FR-009, US-ID: US-006, AC-ID: AC-009
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import OverviewTab from './components/OverviewTab.jsx';
import AlertsTab from './components/AlertsTab.jsx';
import VelocityTab from './components/VelocityTab.jsx';
import ProjectsTable from './components/ProjectsTable.jsx';
import ActivityTab from './components/ActivityTab.jsx';
import FRCoverageTab from './components/FRCoverageTab.jsx';
import GraphTab from './components/GraphTab.jsx';
import IntegrationAlertBanner from './components/IntegrationAlertBanner.jsx';

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

const POLL_INTERVAL_MS   = 5_000;
const FAILURE_THRESHOLD  = 3;
const DASHBOARD_URL      = '/data/dashboard.json';

/**
 * Connection status states.
 * @enum {string}
 */
const CONN = Object.freeze({
  CONNECTED: 'connected',
  RETRYING:  'retrying',
  FAILED:    'failed',
  RESTORED:  'restored',
});

/** Available tab identifiers. */
const TABS = Object.freeze({
  OVERVIEW:  'overview',
  ALERTS:    'alerts',
  COVERAGE:  'coverage',
  VELOCITY:  'velocity',
  ACTIVITY:  'activity',
  ALL:       'all',
  GRAPH:     'graph',
});

/**
 * @returns {JSX.Element}
 */
export default function App() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [connStatus,  setConnStatus]  = useState(CONN.CONNECTED);
  const [failCount,   setFailCount]   = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab,   setActiveTab]   = useState(TABS.OVERVIEW);

  // Use a ref to track failCount so fetchData stays stable (no stale closure).
  const failCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(DASHBOARD_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
      setLastUpdated(new Date());
      if (failCountRef.current > 0) {
        setConnStatus(CONN.RESTORED);
        setTimeout(() => setConnStatus(CONN.CONNECTED), 2_000);
      } else {
        setConnStatus(CONN.CONNECTED);
      }
      failCountRef.current = 0;
      setFailCount(0);
    } catch {
      failCountRef.current += 1;
      setFailCount(failCountRef.current);
      if (failCountRef.current >= FAILURE_THRESHOLD) {
        setConnStatus(CONN.FAILED);
      } else {
        setConnStatus(CONN.RETRYING);
      }
      setLoading(false);
    }
  }, []); // stable — reads failCount via ref, not closure over state

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchData]);

  const projects         = data?.projects ?? [];
  const integrationAlert = data?.integrationAlert ?? null;
  const healthy  = projects.filter(p => p.status === 'healthy').length;
  const warning  = projects.filter(p => p.status === 'warning').length;
  const error    = projects.filter(p => p.status === 'error' || p.status === 'unreadable').length;

  const totalAlerts = projects.reduce((sum, p) => sum + (p.alerts?.length ?? 0), 0);

  return (
    <div className="app">
      <ConnectionBanner status={connStatus} />
      <IntegrationAlertBanner alert={integrationAlert} />

      <Header
        loading={loading}
        healthy={healthy}
        warning={warning}
        error={error}
        projects={projects}
        lastUpdated={lastUpdated}
        onRefresh={fetchData}
      />

      {/* Tab navigation */}
      <nav className="tabs" role="tablist" aria-label="Dashboard views">
        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.OVERVIEW ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.OVERVIEW)}
          aria-selected={activeTab === TABS.OVERVIEW}
        >
          overview.json
          {!loading && (
            <span className="tab-badge">{projects.length}</span>
          )}
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.ALERTS ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.ALERTS)}
          aria-selected={activeTab === TABS.ALERTS}
        >
          alerts.log
          {!loading && totalAlerts > 0 && (
            <span className="tab-badge tab-badge--alert">{totalAlerts}</span>
          )}
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.COVERAGE ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.COVERAGE)}
          aria-selected={activeTab === TABS.COVERAGE}
        >
          coverage.json
          {!loading && (() => {
            const n = projects.filter(p => (p.testSummary?.frCoverage?.length ?? 0) > 0).length;
            return n > 0 ? <span className="tab-badge">{n}</span> : null;
          })()}
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.VELOCITY ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.VELOCITY)}
          aria-selected={activeTab === TABS.VELOCITY}
        >
          velocity.ts
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.ACTIVITY ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.ACTIVITY)}
          aria-selected={activeTab === TABS.ACTIVITY}
        >
          activity.log
          {!loading && (() => {
            const total = projects.reduce((n, p) => n + (p.aitriState?.events?.length ?? 0), 0);
            return total > 0 ? <span className="tab-badge">{total}</span> : null;
          })()}
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.ALL ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.ALL)}
          aria-selected={activeTab === TABS.ALL}
        >
          projects.js
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.GRAPH ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.GRAPH)}
          aria-selected={activeTab === TABS.GRAPH}
        >
          graph.ts
          {!loading && (() => {
            const n = projects.filter(p => p.specArtifacts != null).length;
            return n > 0 ? <span className="tab-badge">{n}</span> : null;
          })()}
        </button>
      </nav>

      <main className="main">
        {/* ── Overview tab ── */}
        {activeTab === TABS.OVERVIEW && (
          <OverviewTab projects={projects} loading={loading} />
        )}

        {/* ── Alerts tab ── */}
        {activeTab === TABS.ALERTS && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <AlertsTab projects={projects} />
        )}

        {/* ── FR Coverage tab ── */}
        {activeTab === TABS.COVERAGE && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <FRCoverageTab projects={projects} />
        )}

        {/* ── Velocity tab ── */}
        {activeTab === TABS.VELOCITY && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <VelocityTab projects={projects} />
        )}

        {/* ── Activity tab ── */}
        {activeTab === TABS.ACTIVITY && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <ActivityTab projects={projects} />
        )}

        {/* ── Graph tab ── */}
        {activeTab === TABS.GRAPH && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <GraphTab projects={projects} />
        )}

        {/* ── All Projects tab ── */}
        {activeTab === TABS.ALL && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : (() => {
                const groups = groupByFolder(projects);
                const multiGroup = groups.length > 1;
                return (
                  <>
                    {groups.map(({ folder, projects: groupProjects }) => (
                      <div key={folder}>
                        {multiGroup && (
                          <div className="folder-group-header">
                            <span className="folder-group-header__label">{folder}/</span>
                          </div>
                        )}
                        <ProjectsTable projects={groupProjects} />
                      </div>
                    ))}
                  </>
                );
              })()
        )}
      </main>
    </div>
  );
}

