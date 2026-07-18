/**
 * Module: web/src/lib/jsonView
 * Purpose: Render parsed JSON as a human-readable structured projection (FR-016) —
 *          objects as aligned key/value rows, arrays as indented lists, primitives
 *          typed and coloured — NOT a raw text dump. XSS-safe: every value is a
 *          React text child (React escapes it); no dangerouslySetInnerHTML.
 *
 * @aitri-trace FR-ID: FR-016, US-ID: US-016, AC-ID: AC-016-2, TC-ID: TC-JSON-016h
 */

import React from 'react';

/** A primitive leaf, coloured by type. */
function Leaf({ value }) {
  if (value === null) return <span className="jv-null">null</span>;
  const t = typeof value;
  if (t === 'boolean') return <span className="jv-bool">{String(value)}</span>;
  if (t === 'number') return <span className="jv-num">{String(value)}</span>;
  return <span className="jv-str">{String(value)}</span>;
}

/**
 * Recursively render a JSON value.
 * @param {{ value:any, k?:string }} props
 */
function Node({ value, k }) {
  if (value === null || typeof value !== 'object') {
    return (
      <div className="jv-row">
        {k != null && <span className="jv-key mono">{k}:</span>}
        <Leaf value={value} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="jv-row">
          {k != null && <span className="jv-key mono">{k}:</span>}
          <span className="jv-empty">[ ] empty</span>
        </div>
      );
    }
    return (
      <div className="jv-block">
        {k != null && <div className="jv-key mono jv-key--group">{k} <span className="jv-count">[{value.length}]</span></div>}
        <div className="jv-children">
          {value.map((v, i) => (
            typeof v === 'object' && v !== null
              ? <div key={i} className="jv-item"><div className="jv-idx mono">#{i + 1}</div><Node value={v} /></div>
              : <div key={i} className="jv-row"><span className="jv-idx mono">#{i + 1}</span><Leaf value={v} /></div>
          ))}
        </div>
      </div>
    );
  }

  const entries = Object.entries(value);
  return (
    <div className="jv-block">
      {k != null && <div className="jv-key mono jv-key--group">{k}</div>}
      <div className="jv-children">
        {entries.map(([key, v]) => <Node key={key} k={key} value={v} />)}
      </div>
    </div>
  );
}

/**
 * Render parsed JSON as a readable projection.
 * @param {{ data:any }} props
 * @returns {JSX.Element}
 */
export function JsonView({ data }) {
  return (
    <div className="json-view" data-testid="json-view">
      <Node value={data} />
    </div>
  );
}
