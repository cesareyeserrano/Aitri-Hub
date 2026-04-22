/**
 * Module: web/src/App
 * Purpose: Root component — polls /data/dashboard.json, manages connection state,
 *          routes between HomeView (/) and AdminPanel (/admin) via minimal URL router.
 *
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010, TC-ID: TC-010h
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import HomeView from './components/HomeView.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import IntegrationAlertBanner from './components/IntegrationAlertBanner.jsx';

const POLL_INTERVAL_MS = 5_000;
const FAILURE_THRESHOLD = 3;
const DASHBOARD_URL = '/data/dashboard.json';

const CONN = Object.freeze({
  CONNECTED: 'connected',
  RETRYING: 'retrying',
  FAILED: 'failed',
  RESTORED: 'restored',
});

/**
 * Minimal 2-route URL router — no external dependencies.
 * Listens to popstate; uses window.history.pushState for navigation.
 * @returns {string} current pathname
 */
function useRoute() {
  const [route, setRoute] = useState(() => window.location.pathname);
  useEffect(() => {
    function onPop() {
      setRoute(window.location.pathname);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

/**
 * @returns {JSX.Element}
 */
export default function App() {
  const route = useRoute();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connStatus, setConnStatus] = useState(CONN.CONNECTED);
  const [lastUpdated, setLastUpdated] = useState(null);

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
    } catch {
      failCountRef.current += 1;
      setConnStatus(failCountRef.current >= FAILURE_THRESHOLD ? CONN.FAILED : CONN.RETRYING);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchData]);

  const projects = data?.projects ?? [];
  const integrationAlert = data?.integrationAlert ?? null;
  const healthy = projects.filter(p => p.status === 'healthy').length;
  const warning = projects.filter(p => p.status === 'warning').length;
  const error = projects.filter(p => p.status === 'error' || p.status === 'unreadable').length;

  const isAdmin = route === '/admin' || route.startsWith('/admin');

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
        isAdmin={isAdmin}
      />

      <main className="main">
        {isAdmin ? <AdminPanel /> : <HomeView projects={projects} loading={loading} />}
      </main>
    </div>
  );
}
