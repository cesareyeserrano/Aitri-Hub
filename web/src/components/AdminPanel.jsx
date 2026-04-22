/**
 * Module: web/src/components/AdminPanel
 * Purpose: Root admin panel — fetches project list, owns add/edit/remove state.
 *
 * @aitri-trace FR-ID: FR-013, FR-014, FR-015, US-ID: US-013, US-014, US-015,
 *              AC-ID: AC-014, AC-015, AC-016, AC-017, AC-018, TC-ID: TC-013h
 */

import React, { useState, useEffect, useCallback } from 'react';
import AdminProjectList from './AdminProjectList.jsx';
import AdminAddForm from './AdminAddForm.jsx';
import RemoveConfirmDialog from './RemoveConfirmDialog.jsx';
import { getProjects, addProject, updateProject, removeProject } from '../lib/adminApi.js';

/**
 * @returns {JSX.Element}
 */
export default function AdminPanel() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data.projects ?? []);
      setError(null);
    } catch (err) {
      setError(err.message ?? 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleAdd(payload) {
    const { project } = await addProject(payload);
    setProjects(prev => [...prev, project]);
    setShowAddForm(false);
  }

  async function handleEdit(id, updates) {
    const { project } = await updateProject(id, updates);
    setProjects(prev => prev.map(p => (p.id === id ? project : p)));
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    await removeProject(removeTarget.id);
    setProjects(prev => prev.filter(p => p.id !== removeTarget.id));
    setRemoveTarget(null);
  }

  return (
    <div className="admin-panel" data-testid="admin-panel">
      {/* Header */}
      <div className="admin-panel__header">
        <div className="admin-panel__title">
          <span className="admin-panel__prefix">// </span>
          admin.projects
        </div>
        <div className="admin-panel__nav">
          <a
            href="/"
            className="admin-nav-link"
            onClick={e => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            ← dashboard
          </a>
        </div>
      </div>

      <hr className="card__divider" />

      {/* Error state */}
      {error && (
        <div className="admin-panel__error" role="alert" data-testid="admin-error">
          ✖ {error}
        </div>
      )}

      {/* Loading */}
      {loading && !error && <div className="admin-panel__loading">loading…</div>}

      {/* Project list */}
      {!loading && !error && (
        <AdminProjectList
          projects={projects}
          onEdit={handleEdit}
          onRemove={project => setRemoveTarget(project)}
        />
      )}

      {/* Add project */}
      {!loading && !error && (
        <div className="admin-panel__add">
          {showAddForm ? (
            <AdminAddForm onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
          ) : (
            <button
              className="btn btn--primary"
              onClick={() => setShowAddForm(true)}
              data-testid="add-project-btn"
            >
              + add project
            </button>
          )}
        </div>
      )}

      {/* Remove confirmation dialog */}
      {removeTarget && (
        <RemoveConfirmDialog
          project={removeTarget}
          onConfirm={handleRemoveConfirm}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
