/**
 * Module: web/src/components/EmptyState
 * Purpose: Explanatory empty/degraded state for a tab whose artifact is absent
 *          or malformed — always names the artifact AND the aitri command that
 *          produces it (FR-059). Never a blank panel.
 */

import React from 'react';

/**
 * @param {{ artifact:string, command:string, malformed?:boolean, note?:string }} props
 */
export default function EmptyState({ artifact, command, malformed = false, note }) {
  return (
    <div className="empty-state" data-testid="empty-state" role="status">
      <div className="empty-state__icon">{malformed ? '⚠' : '○'}</div>
      <div className="empty-state__body">
        <div className="empty-state__title">
          {malformed ? `${artifact} could not be read` : `${artifact} not produced yet`}
        </div>
        {note && <div className="empty-state__note">{note}</div>}
        <div className="empty-state__cmd">
          Run: <code>{command}</code>
        </div>
      </div>
    </div>
  );
}
