/**
 * Module: web/src/lib/adminApi
 * Purpose: Fetch wrappers for the /api/projects admin API.
 *
 * @aitri-trace FR-ID: FR-016, US-ID: US-016, AC-ID: AC-019, TC-ID: TC-016h
 */

const BASE = '/api/projects';

/**
 * Fetch all registered projects.
 * @returns {Promise<{ projects: object[] }>}
 */
export async function getProjects() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`GET /api/projects failed: ${res.status}`);
  return res.json();
}

/**
 * Add a new project.
 * @param {{ name: string, type: string, location: string }} project
 * @returns {Promise<{ project: object }>}
 */
export async function addProject(project) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'add_failed'), { code: json.error, status: res.status });
  return json;
}

/**
 * Update an existing project.
 * @param {string} id
 * @param {{ name?: string, location?: string }} updates
 * @returns {Promise<{ project: object }>}
 */
export async function updateProject(id, updates) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'update_failed'), { code: json.error, status: res.status });
  return json;
}

/**
 * Remove a project by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removeProject(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const json = await res.json().catch(() => ({}));
    throw Object.assign(new Error(json.error ?? 'remove_failed'), { code: json.error, status: res.status });
  }
}
