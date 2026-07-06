/**
 * Module: web/src/lib/navigate
 * Purpose: Minimal client-side navigation (no router dependency — ADR-Q3).
 *          pushState + a popstate-driven route hook.
 */

import { useState, useEffect } from 'react';

/**
 * Navigate to a client route without a full page reload.
 * @param {string} to - Pathname (e.g. '/project/abc').
 */
export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  // pushState does not emit popstate; dispatch one so useRoute re-reads.
  window.dispatchEvent(new PopStateEvent('popstate'));
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
