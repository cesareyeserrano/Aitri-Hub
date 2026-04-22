/**
 * Module: web/src/components/AdminAddForm
 * Purpose: Inline form to add a new project.
 *
 * @aitri-trace FR-ID: FR-014, US-ID: US-014, AC-ID: AC-015, TC-ID: TC-014h
 */

import React, { useState } from 'react';

const ERROR_MESSAGES = {
  name_required: 'Name is required.',
  name_duplicate: 'A project with that name already exists.',
  location_required: 'Location is required.',
  path_traversal: 'Path contains invalid segments (..).',
  path_not_found: 'Path not found on the filesystem.',
  not_a_directory: 'Path exists but is not a directory.',
  invalid_json: 'Invalid request.',
};

/**
 * @param {{
 *   onSubmit: (project: { name: string, type: string, location: string }) => Promise<void>,
 *   onCancel: () => void,
 * }} props
 * @returns {JSX.Element}
 */
export default function AdminAddForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('local');
  const [location, setLocation] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), type, location: location.trim() });
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? err.message ?? 'Unknown error.');
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-add-form" onSubmit={handleSubmit} data-testid="add-project-form">
      <div className="admin-add-form__header">
        <span style={{ color: 'var(--syn-green)' }}>+</span> Add project
      </div>

      {error && (
        <div className="admin-add-form__error" role="alert" data-testid="form-error">
          ✖ {error}
        </div>
      )}

      <div className="admin-add-form__fields">
        <label className="admin-field">
          <span className="admin-field__label">name</span>
          <input
            className="admin-field__input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="my-project"
            required
            autoFocus
            data-testid="input-name"
          />
        </label>

        <label className="admin-field">
          <span className="admin-field__label">type</span>
          <select
            className="admin-field__input"
            value={type}
            onChange={e => setType(e.target.value)}
            data-testid="input-type"
          >
            <option value="local">local</option>
            <option value="remote">remote</option>
            <option value="folder">folder</option>
          </select>
          {type === 'folder' && (
            <p className="admin-field__hint" data-testid="folder-hint">
              Scans immediate child directories — each one with <code>package.json</code> or{' '}
              <code>.aitri</code> appears as its own card.
            </p>
          )}
        </label>

        <label className="admin-field">
          <span className="admin-field__label">
            {type === 'remote' ? 'url' : type === 'folder' ? 'folder path' : 'path'}
          </span>
          <input
            className="admin-field__input"
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={
              type === 'remote'
                ? 'https://github.com/org/repo'
                : type === 'folder'
                  ? '/abs/path/to/workspace'
                  : '/abs/path/to/project'
            }
            required
            data-testid="input-location"
          />
        </label>
      </div>

      <div className="admin-add-form__actions">
        <button
          className="btn btn--primary"
          type="submit"
          disabled={submitting}
          data-testid="submit-add"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
