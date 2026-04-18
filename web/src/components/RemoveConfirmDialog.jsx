/**
 * Module: web/src/components/RemoveConfirmDialog
 * Purpose: Confirmation modal before removing a project.
 *
 * @aitri-trace FR-ID: FR-015, US-ID: US-015, AC-ID: AC-017, TC-ID: TC-015h
 */

import React from 'react';

/**
 * @param {{
 *   project: { name: string },
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 * @returns {JSX.Element}
 */
export default function RemoveConfirmDialog({ project, onConfirm, onCancel }) {
  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Confirm removal">
      <div className="dialog">
        <div className="dialog__header">
          <span className="dialog__icon" style={{ color: 'var(--syn-red)' }}>✖</span>
          <span className="dialog__title">Remove project?</span>
        </div>
        <p className="dialog__body">
          <span style={{ color: 'var(--syn-orange)' }}>{project.name}</span> will be removed from the
          dashboard. This only affects monitoring — your project files are untouched.
        </p>
        <div className="dialog__actions">
          <button className="btn btn--danger" onClick={onConfirm} data-testid="confirm-remove">
            Remove
          </button>
          <button className="btn btn--ghost" onClick={onCancel} data-testid="cancel-remove">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
