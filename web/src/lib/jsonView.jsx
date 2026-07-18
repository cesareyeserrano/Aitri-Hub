/**
 * Module: web/src/lib/jsonView
 * Purpose: Render parsed JSON as a human-readable structured projection (FR-016) —
 *          objects as aligned key/value rows, arrays as indented lists, primitives
 *          typed and coloured — NOT a raw text dump. XSS-safe: every value is a
 *          React text child (React escapes it); no dangerouslySetInnerHTML.
 *
 * @aitri-trace FR-ID: FR-016, US-ID: US-016, AC-ID: AC-016-2, TC-ID: TC-JSON-016h
 */

import React, { useState } from 'react';

/** A primitive leaf, coloured by type. */
function Leaf({ value }) {
  if (value === null) return <span className="jv-null">null</span>;
  const t = typeof value;
  if (t === 'boolean') return <span className="jv-bool">{String(value)}</span>;
  if (t === 'number') return <span className="jv-num">{String(value)}</span>;
  return <span className="jv-str">{String(value)}</span>;
}

/**
 * A collapsible object/array group. Large collections (>20 items) default collapsed
 * so a big artifact opens compact; everything else defaults expanded.
 * @param {{ label:React.ReactNode, count:number, depth:number, children:React.ReactNode }} props
 */
function Group({ label, count, depth, children }) {
  const [open, setOpen] = useState(!(count > 20 && depth > 0));
  return (
    <div className="jv-block">
      <button className="jv-toggle mono" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="jv-caret">{open ? '▾' : '▸'}</span>
        {label}
      </button>
      {open && <div className="jv-children">{children}</div>}
    </div>
  );
}

/**
 * A telling label for an object with no key of its own (e.g. an array item):
 * its id/name/title/… value, so a list reads "FR-001, FR-002" instead of
 * "object, object". Returns null when the object carries no such field.
 * @param {object} obj
 * @returns {string|null}
 */
function objectLabel(obj) {
  const KEYS = ['id', 'tc_id', 'fr_id', 'name', 'title', 'key', 'label', 'ac_id', 'requirement_id', 'role', 'tool'];
  for (const key of KEYS) {
    const v = obj[key];
    if (v != null && typeof v !== 'object') return `${key}: ${v}`;
  }
  return null;
}

/**
 * Recursively render a JSON value.
 * @param {{ value:any, k?:string, depth?:number }} props
 */
function Node({ value, k, depth = 0 }) {
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
    const label = <span className="jv-key jv-key--group">{k ?? 'array'} <span className="jv-count">[{value.length}]</span></span>;
    return (
      <Group label={label} count={value.length} depth={depth}>
        {value.map((v, i) => (
          typeof v === 'object' && v !== null
            ? <div key={i} className="jv-item"><div className="jv-idx mono">#{i + 1}</div><Node value={v} depth={depth + 1} /></div>
            : <div key={i} className="jv-row"><span className="jv-idx mono">#{i + 1}</span><Leaf value={v} /></div>
        ))}
      </Group>
    );
  }

  const entries = Object.entries(value);
  // Prefer the object's own key; for a keyless item (array element) use a telling
  // identifier from its content rather than the generic word "object".
  const title = k ?? objectLabel(value) ?? 'object';
  const label = <span className="jv-key jv-key--group">{title} <span className="jv-count">{`{${entries.length}}`}</span></span>;
  return (
    <Group label={label} count={entries.length} depth={depth}>
      {entries.map(([key, v]) => <Node key={key} k={key} value={v} depth={depth + 1} />)}
    </Group>
  );
}

/**
 * Render parsed JSON as a readable projection.
 * @param {{ data:any }} props
 * @returns {JSX.Element}
 */
export function JsonView({ data }) {
  // Render the root's members directly (expanded) so there is no redundant
  // top-level toggle; nested objects/arrays are individually collapsible.
  let body;
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    body = Object.entries(data).map(([key, v]) => <Node key={key} k={key} value={v} depth={1} />);
  } else if (Array.isArray(data)) {
    body = data.map((v, i) => (
      typeof v === 'object' && v !== null
        ? <div key={i} className="jv-item"><div className="jv-idx mono">#{i + 1}</div><Node value={v} depth={1} /></div>
        : <div key={i} className="jv-row"><span className="jv-idx mono">#{i + 1}</span><Leaf value={v} /></div>
    ));
  } else {
    body = <Node value={data} />;
  }
  return <div className="json-view" data-testid="json-view">{body}</div>;
}
