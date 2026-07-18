/**
 * Module: web/src/lib/navigate
 * Purpose: Minimal client-side navigation (no router dependency — ADR-Q3).
 *          pushState + a popstate-driven route hook.
 */

import { useState, useEffect } from 'react';

/**
 * Navigate to a client route without a full page reload.
 * @param {string} to - Pathname, optionally with a query (e.g. '/project/abc', '/?filter=CRITICAL').
 */
export function navigate(to) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, '', to);
  // pushState does not emit popstate; dispatch one so useRoute re-reads.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Read the Monitor health filter from the current URL (persisted so browser-back
 * from a Detail view restores the prior filter — FR-012 AC-012-1).
 * @returns {string} the filter ('ALL' when none set)
 */
export function readMonitorFilter() {
  return new URLSearchParams(window.location.search).get('filter') || 'ALL';
}

/**
 * Persist the Monitor health filter into the current history entry's URL, in place
 * (replaceState — no new history entry), so the Monitor entry the user backs into
 * still carries the filter. No-op unless on the home route.
 * @param {string} filter - 'ALL' | 'CRITICAL' | 'AT RISK' | 'NOMINAL'
 */
export function writeMonitorFilter(filter) {
  const onHome = parseRoute(window.location.pathname).name === 'home';
  if (!onHome) return;
  const url = filter && filter !== 'ALL' ? `/?filter=${encodeURIComponent(filter)}` : '/';
  window.history.replaceState({}, '', url);
}

/**
 * Parse the current pathname into a route descriptor.
 * @returns {{name:'home'|'admin'|'project', id?:string, path:string}}
 */
export function parseRoute(pathname) {
  const projectMatch = pathname.match(/^\/project\/([^/]+)\/?$/);
  if (projectMatch) return { name: 'project', id: decodeURIComponent(projectMatch[1]), path: pathname };
  if (pathname === '/admin' || pathname.startsWith('/admin')) return { name: 'admin', path: pathname };
  return { name: 'home', path: pathname };
}

/**
 * Route hook: current parsed route, updated on popstate.
 * @returns {ReturnType<typeof parseRoute>}
 */
export function useRoute() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return parseRoute(pathname);
}
