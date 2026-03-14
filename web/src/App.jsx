/**
 * Module: web/src/App
 * Purpose: Root component — polls /data/dashboard.json every 5s, manages connection state,
 *          renders tab navigation and active view.
 *
 * @aitri-trace FR-ID: FR-006, FR-009, US-ID: US-006, AC-ID: AC-009
 */

import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.jsx';
import ProjectCard from './components/ProjectCard.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import AlertsTab from './components/AlertsTab.jsx';
import VelocityTab from './components/VelocityTab.jsx';
import ProjectsTable from './components/ProjectsTable.jsx';

/**
 * Group projects by parent folder name (basename of parent dir for local, 'remote' for URLs).
 * @param {object[]} projects
 * @returns {{ folder: string, projects: object[] }[]}
 */
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
  VELOCITY:  'velocity',
  ALL:       'all',
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(DASHBOARD_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
      setLastUpdated(new Date());
      if (failCount > 0) {
        setConnStatus(CONN.RESTORED);
        setTimeout(() => setConnStatus(CONN.CONNECTED), 2_000);
      } else {
        setConnStatus(CONN.CONNECTED);
      }
      setFailCount(0);
    } catch {
      const newCount = failCount + 1;
      setFailCount(newCount);
      if (newCount >= FAILURE_THRESHOLD) {
        setConnStatus(CONN.FAILED);
      } else {
        setConnStatus(CONN.RETRYING);
      }
      setLoading(false);
    }
  }, [failCount]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const projects = data?.projects ?? [];
  const healthy  = projects.filter(p => p.status === 'healthy').length;
  const warning  = projects.filter(p => p.status === 'warning').length;
  const error    = projects.filter(p => p.status === 'error' || p.status === 'unreadable').length;

  const totalAlerts = projects.reduce((sum, p) => sum + (p.alerts?.length ?? 0), 0);

  return (
    <div className="app">
      <ConnectionBanner status={connStatus} />

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
          className={`tab-btn ${activeTab === TABS.VELOCITY ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.VELOCITY)}
          aria-selected={activeTab === TABS.VELOCITY}
        >
          velocity.ts
        </button>

        <button
          role="tab"
          className={`tab-btn ${activeTab === TABS.ALL ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab(TABS.ALL)}
          aria-selected={activeTab === TABS.ALL}
        >
          projects.js
        </button>
      </nav>

      <main className="main">
        {/* ── Overview tab ── */}
        {activeTab === TABS.OVERVIEW && (
          <>
            {loading && (
              <div className="project-grid">
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            )}
            {!loading && projects.length === 0 && (
              <div className="empty-state">
                <p>No projects registered.</p>
                <p>
                  Run <code>aitri-hub setup</code> to add projects, then{' '}
                  <code>aitri-hub monitor</code> to start collecting data.
                </p>
              </div>
            )}
            {!loading && projects.length > 0 && (() => {
              const groups = groupByFolder(projects);
              const multiGroup = groups.length > 1;
              let globalIdx = 0;
              return groups.map(({ folder, projects: groupProjects }) => (
                <div key={folder}>
                  {multiGroup && (
                    <div className="folder-group-header">
                      <span className="folder-group-header__label">{folder}/</span>
                    </div>
                  )}
                  <div className="project-grid">
                    {groupProjects.map((project) => {
                      const delay = globalIdx++ * 50;
                      return (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          animationDelay={delay}
                        />
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </>
        )}

        {/* ── Alerts tab ── */}
        {activeTab === TABS.ALERTS && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <AlertsTab projects={projects} />
        )}

        {/* ── Velocity tab ── */}
        {activeTab === TABS.VELOCITY && (
          loading
            ? <div className="empty-state"><p>Loading…</p></div>
            : <VelocityTab projects={projects} />
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
