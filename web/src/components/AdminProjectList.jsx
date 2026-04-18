/**
 * Module: web/src/components/AdminProjectList
 * Purpose: Renders the list of registered projects with edit and remove controls.
 *
 * @aitri-trace FR-ID: FR-013, FR-015, US-ID: US-013, US-015, AC-ID: AC-014, AC-017, TC-ID: TC-013h
 */

import React, { useState } from 'react';

const ERROR_MESSAGES = {
  name_required:  'Name is required.',
  path_traversal: 'Path contains invalid segments (..).',
  path_not_found: 'Path not found on the filesystem.',
};

/**
 * Inline edit row for a single project.
 */
function EditRow({ project, onSave, onCancel }) {
  const [name, setName]         = useState(project.name);
  const [location, setLocation] = useState(project.location);
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(project.id, { name: name.trim(), location: location.trim() });
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? err.message ?? 'Save failed.');
      setSaving(false);
    }
  }

  return (
    <form className="admin-edit-row" onSubmit={handleSave} data-testid="edit-row">
      {error && <div className="admin-add-form__error" role="alert">{error}</div>}
      <input
        className="admin-field__input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="name"
        required
        autoFocus
        data-testid="edit-name"
      />
      <input
        className="admin-field__input"
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="path or URL"
        required
        data-testid="edit-location"
      />
      <div className="admin-edit-row__actions">
        <button className="btn btn--primary btn--sm" type="submit" disabled={saving}>
          {saving ? '…' : 'Save'}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * @param {{
 *   projects: object[],
 *   onEdit: (id: string, updates: object) => Promise<void>,
 *   onRemove: (project: object) => void,
 * }} props
 * @returns {JSX.Element}
 */
export default function AdminProjectList({ projects, onEdit, onRemove }) {
  const [editingId, setEditingId] = useState(null);

  if (projects.length === 0) {
    return (
      <div className="admin-empty" data-testid="admin-empty">
        <span style={{ color: 'var(--syn-comment)' }}>// </span>
        No projects registered. Add one above.
      </div>
    );
  }

  return (
    <div className="admin-project-list">
      {projects.map(project => (
        <div key={project.id} className="admin-project-row" data-testid="project-row">
          {editingId === project.id ? (
            <EditRow
              project={project}
              onSave={async (id, updates) => {
                await onEdit(id, updates);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="admin-project-row__info">
                <span className="admin-project-row__name">{project.name}</span>
                <span className="admin-project-row__type">[{project.type}]</span>
                <span className="admin-project-row__location">{project.location}</span>
              </div>
              <div className="admin-project-row__actions">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setEditingId(project.id)}
                  data-testid="edit-btn"
                >
                  edit
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => onRemove(project)}
                  data-testid="remove-btn"
                >
                  remove
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
