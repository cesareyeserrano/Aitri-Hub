/**
 * Module: commands/web
 * Purpose: Start the Aitri Hub web dashboard using a built-in Node.js static server.
 * No Docker required — serves the built React app + dashboard.json directly.
 * Dependencies: node:http, node:fs, node:path, node:url, node:child_process, constants
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll } from '../collector/index.js';
import { readProjects, hubDir } from '../store/projects.js';
import { writeDashboard, appendLog } from '../store/dashboard.js';
import { scanDir, mergeProjects } from '../utils/scan.js';
import { WEB_PORT, REFRESH_MS } from '../constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const WEB_DIR = path.join(PACKAGE_ROOT, 'web');
const DIST_DIR = path.join(PACKAGE_ROOT, 'docker', 'web-dist');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

function buildIfNeeded() {
  if (!fs.existsSync(DIST_DIR)) {
    console.log('Building web app (first run)...');
    execSync('npm run build', { cwd: WEB_DIR, stdio: 'inherit' });
  }
}

async function runCollectionCycle() {
  let registered = [];
  const scanDirPaths = [];
  try {
    const cfg = readProjects();
    registered = cfg.projects ?? [];
    if (Array.isArray(cfg.scanDirs)) scanDirPaths.push(...cfg.scanDirs);
  } catch { /* no projects.json yet */ }
  if (process.env.AITRI_HUB_SCAN_DIR) {
    process.env.AITRI_HUB_SCAN_DIR.split(',').map(d => path.resolve(d.trim())).forEach(d => {
      if (!scanDirPaths.includes(d)) scanDirPaths.push(d);
    });
  }
  const scanned = scanDirPaths.flatMap(dir =>
    scanDir(dir).map(p => ({ ...p, group: path.basename(dir) }))
  );
  const projects = mergeProjects(registered, scanned);
  try {
    const data = await collectAll(projects);
    writeDashboard(data);
  } catch (err) {
    appendLog(`web collection error: ${err.message}`);
  }
}

/**
 * Start the Aitri Hub web dashboard.
 * Serves the React SPA from web/dist and dashboard.json from ~/.aitri-hub/.
 *
 * @aitri-trace FR-ID: FR-006, US-ID: US-006, AC-ID: AC-009, TC-ID: TC-006h
 *
 * @returns {Promise<void>}
 */
export async function cmdWeb() {
  buildIfNeeded();

  const port = WEB_PORT;
  const dataDir = hubDir();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    // Security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok\n');
      return;
    }

    // /data/ → serve from ~/.aitri-hub/
    if (pathname.startsWith('/data/')) {
      const fileName = pathname.slice('/data/'.length);
      const filePath = path.join(dataDir, fileName);

      // Prevent path traversal: resolved path must stay within dataDir
      if (!filePath.startsWith(dataDir + path.sep) && filePath !== dataDir) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }

      if (!fs.existsSync(filePath)) {
        // Return an empty dashboard so the React app shows "no projects" instead of an error
        if (fileName === 'dashboard.json') {
          const empty = JSON.stringify({ schemaVersion: '1', collectedAt: new Date().toISOString(), projects: [] });
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(empty);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
      }

      try {
        const content = fs.readFileSync(filePath);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'read error' }));
      }
      return;
    }

    // Static assets from dist/
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

    // SPA fallback — unknown paths serve index.html
    try {
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
    } catch {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    try {
      res.writeHead(200, { 'Content-Type': mime(filePath) });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      console.error(`  Kill the existing process: lsof -ti:${port} | xargs kill`);
      console.error(`  Or use a different port:   AITRI_HUB_PORT=3001 aitri-hub web`);
    } else {
      console.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });

  // Start collection loop — runs immediately then every REFRESH_MS
  runCollectionCycle();
  const collectTimer = setInterval(runCollectionCycle, REFRESH_MS);

  server.listen(port, () => {
    console.log(`✓ Dashboard running at http://localhost:${port}`);
    console.log('  Press Ctrl+C to stop.');
    try { execSync(`open http://localhost:${port}`, { stdio: 'ignore' }); } catch {}
  });

  process.on('SIGINT', () => {
    clearInterval(collectTimer);
    server.close();
    process.exit(0);
  });
}
