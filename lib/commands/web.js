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
import { readProjects, hubDir, projectId } from '../store/projects.js';
import { writeDashboard, appendLog } from '../store/dashboard.js';
import { scanDir, mergeProjects } from '../utils/scan.js';
import { WEB_PORT, REFRESH_MS, PROJECTS_FILE } from '../constants.js';

const MAX_BODY_BYTES = 64 * 1024;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const WEB_DIR = path.join(PACKAGE_ROOT, 'web');
const DIST_DIR = path.join(PACKAGE_ROOT, 'docker', 'web-dist');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
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
  } catch {
    /* no projects.json yet */
  }
  if (process.env.AITRI_HUB_SCAN_DIR) {
    process.env.AITRI_HUB_SCAN_DIR.split(',')
      .map(d => path.resolve(d.trim()))
      .forEach(d => {
        if (!scanDirPaths.includes(d)) scanDirPaths.push(d);
      });
  }
  const scanned = scanDirPaths.flatMap(dir =>
    scanDir(dir).map(p => ({ ...p, group: path.basename(dir) })),
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

    // /api/projects — admin CRUD for projects.json
    if (pathname.startsWith('/api/projects')) {
      // Only allow localhost connections
      const remoteAddr = req.socket.remoteAddress;
      if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
        // Silently drop non-localhost requests per FR-016
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }

      const projectsPath = path.join(dataDir, PROJECTS_FILE);

      function readProjectsFile() {
        if (!fs.existsSync(projectsPath)) return { projects: [] };
        try {
          const raw = fs.readFileSync(projectsPath, 'utf8');
          const parsed = JSON.parse(raw);
          return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
        } catch {
          return { projects: [] };
        }
      }

      function writeProjectsFile(projects) {
        const tmpPath = projectsPath + '.tmp';
        try {
          fs.writeFileSync(tmpPath, JSON.stringify({ projects }, null, 2), 'utf8');
          fs.renameSync(tmpPath, projectsPath);
        } catch (err) {
          try {
            fs.rmSync(tmpPath, { force: true });
          } catch {}
          throw err;
        }
      }

      function validateLocation(location, type) {
        if (!location) return { error: 'location_required' };
        if (typeof location === 'string' && location.includes('..'))
          return { error: 'path_traversal' };
        if (type !== 'remote' && location && !path.isAbsolute(location)) {
          return { error: 'location_required' };
        }
        if (type !== 'remote' && location && !fs.existsSync(location)) {
          return { error: 'path_not_found' };
        }
        if (
          type === 'folder' &&
          location &&
          fs.existsSync(location) &&
          !fs.statSync(location).isDirectory()
        ) {
          return { error: 'not_a_directory' };
        }
        return null;
      }

      function logRequest(method, path_, status) {
        console.log(`[${new Date().toISOString()}] ${method} ${path_} ${status}`);
      }

      const idMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);

      // GET /api/projects
      if (req.method === 'GET' && pathname === '/api/projects') {
        const { projects } = readProjectsFile();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects }));
        logRequest('GET', '/api/projects', 200);
        return;
      }

      // POST /api/projects
      if (req.method === 'POST' && pathname === '/api/projects') {
        let body = '';
        let bytes = 0;
        let tooLarge = false;
        req.on('data', chunk => {
          if (tooLarge) return;
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            tooLarge = true;
            logRequest('POST', '/api/projects', 413);
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'payload_too_large' }));
            req.destroy();
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          if (tooLarge) return;
          let payload;
          try {
            payload = JSON.parse(body);
          } catch {
            logRequest('POST', '/api/projects', 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_json' }));
            return;
          }
          const { name, type = 'local', location } = payload;
          if (!name || !name.trim()) {
            logRequest('POST', '/api/projects', 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'name_required' }));
            return;
          }
          const locErr = validateLocation(location, type);
          if (locErr) {
            logRequest('POST', '/api/projects', 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(locErr));
            return;
          }
          const { projects } = readProjectsFile();
          if (projects.some(p => p.name === name.trim())) {
            logRequest('POST', '/api/projects', 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'name_duplicate' }));
            return;
          }
          const project = {
            id: projectId(location),
            name: name.trim(),
            type,
            location,
            addedAt: new Date().toISOString(),
          };
          try {
            writeProjectsFile([...projects, project]);
            logRequest('POST', '/api/projects', 201);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ project }));
          } catch {
            logRequest('POST', '/api/projects', 500);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'write_failed' }));
          }
        });
        return;
      }

      // PUT /api/projects/:id
      if (req.method === 'PUT' && idMatch) {
        const targetId = idMatch[1];
        let body = '';
        let bytes = 0;
        let tooLarge = false;
        req.on('data', chunk => {
          if (tooLarge) return;
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            tooLarge = true;
            logRequest('PUT', `/api/projects/${targetId}`, 413);
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'payload_too_large' }));
            req.destroy();
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          if (tooLarge) return;
          let payload;
          try {
            payload = JSON.parse(body);
          } catch {
            logRequest('PUT', `/api/projects/${targetId}`, 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_json' }));
            return;
          }
          const { projects } = readProjectsFile();
          const idx = projects.findIndex(p => p.id === targetId);
          if (idx === -1) {
            logRequest('PUT', `/api/projects/${targetId}`, 404);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found' }));
            return;
          }
          const { name, location } = payload;
          if (name !== undefined && !name.trim()) {
            logRequest('PUT', `/api/projects/${targetId}`, 400);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'name_required' }));
            return;
          }
          if (location !== undefined) {
            const locErr = validateLocation(location, projects[idx].type);
            if (locErr) {
              logRequest('PUT', `/api/projects/${targetId}`, 400);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(locErr));
              return;
            }
          }
          const updated = { ...projects[idx] };
          if (name !== undefined) updated.name = name.trim();
          if (location !== undefined) updated.location = location;
          projects[idx] = updated;
          try {
            writeProjectsFile(projects);
            logRequest('PUT', `/api/projects/${targetId}`, 200);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ project: updated }));
          } catch {
            logRequest('PUT', `/api/projects/${targetId}`, 500);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'write_failed' }));
          }
        });
        return;
      }

      // DELETE /api/projects/:id
      if (req.method === 'DELETE' && idMatch) {
        const targetId = idMatch[1];
        const { projects } = readProjectsFile();
        const idx = projects.findIndex(p => p.id === targetId);
        if (idx === -1) {
          logRequest('DELETE', `/api/projects/${targetId}`, 404);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_found' }));
          return;
        }
        const remaining = projects.filter(p => p.id !== targetId);
        try {
          writeProjectsFile(remaining);
          logRequest('DELETE', `/api/projects/${targetId}`, 204);
          res.writeHead(204);
          res.end();
        } catch {
          logRequest('DELETE', `/api/projects/${targetId}`, 500);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'write_failed' }));
        }
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    // /data/ → serve from ~/.aitri-hub/
    if (pathname.startsWith('/data/')) {
      const fileName = pathname.slice('/data/'.length);
      const filePath = path.join(dataDir, fileName);

      // First line: reject '..' traversal at the logical path level.
      if (!filePath.startsWith(dataDir + path.sep) && filePath !== dataDir) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }

      if (!fs.existsSync(filePath)) {
        // Return an empty dashboard so the React app shows "no projects" instead of an error
        if (fileName === 'dashboard.json') {
          const empty = JSON.stringify({
            schemaVersion: '1',
            collectedAt: new Date().toISOString(),
            projects: [],
          });
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(empty);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
      }

      // Second line: resolve symlinks on both sides so a symlink inside
      // ~/.aitri-hub/ pointing outside cannot escape the data dir.
      let realFile, realRoot;
      try {
        realFile = fs.realpathSync(filePath);
        realRoot = fs.realpathSync(dataDir);
      } catch {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      if (!realFile.startsWith(realRoot + path.sep) && realFile !== realRoot) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }

      try {
        const content = fs.readFileSync(realFile);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'read error' }));
      }
      return;
    }

    // Any /api/* path that wasn't claimed above is an unknown API route.
    // Return 404 JSON instead of falling through to the SPA fallback, which
    // would otherwise serve index.html with HTTP 200 and HTML content-type.
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
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

  server.listen(port, '127.0.0.1', () => {
    console.log(`✓ Dashboard running at http://localhost:${port}`);
    console.log('  Press Ctrl+C to stop.');
    try {
      execSync(`open http://localhost:${port}`, { stdio: 'ignore' });
    } catch {}
  });

  process.on('SIGINT', () => {
    clearInterval(collectTimer);
    server.close();
    process.exit(0);
  });
}
