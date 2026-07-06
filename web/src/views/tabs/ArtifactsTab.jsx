/**
 * Module: web/src/views/tabs/ArtifactsTab
 * Purpose: Rendered reading view of the artifact chain — markdown formatted,
 *          01_REQUIREMENTS.json as a human PRD table, other JSON as a summary +
 *          collapsible raw view. Chain list marks presence/absence (FR-058).
 *
 * @aitri-trace FR-ID: FR-058, US-ID: US-058, AC-ID: AC-0581, AC-0582, TC-ID: TC-058h, TC-058e, TC-058f
 */

import React, { useState } from 'react';
import { renderMarkdown } from '../../lib/markdown.jsx';

const OPTIONAL = new Set(['00_DISCOVERY.md', '01_UX_SPEC.md', '04_CODE_REVIEW.md', 'AUDIT_REPORT.md']);

function RawToggle({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="raw-toggle">
      <button className="raw-toggle__btn" onClick={() => setOpen(o => !o)} data-testid="raw-toggle">
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <pre className="raw-json" data-testid="raw-json">{children}</pre>}
    </div>
  );
}

function PrdView({ parsed }) {
  const frs = Array.isArray(parsed?.functional_requirements) ? parsed.functional_requirements : [];
  const personas = Array.isArray(parsed?.user_personas) ? parsed.user_personas : [];
  const noGo = Array.isArray(parsed?.no_go_zone) ? parsed.no_go_zone : [];
  return (
    <div className="prd-view" data-testid="prd-view">
      <table className="data-table">
        <thead><tr><th>FR</th><th>title</th><th>priority</th><th>acceptance criteria</th></tr></thead>
        <tbody>
          {frs.map(fr => (
            <tr key={fr.id}>
              <td className="mono">{fr.id}</td>
              <td>{fr.title}</td>
              <td>{fr.priority}</td>
              <td>
                <ul className="ac-list">
                  {(Array.isArray(fr.acceptance_criteria) ? fr.acceptance_criteria : []).map((ac, i) => (
                    <li key={i}>{typeof ac === 'string' ? ac : JSON.stringify(ac)}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {personas.length > 0 && (
        <div className="prd-personas">
          <h4>Personas</h4>
          <ul>{personas.map((p, i) => <li key={i}><strong>{p.role}</strong> — {p.goal}</li>)}</ul>
        </div>
      )}
      {noGo.length > 0 && (
        <div className="prd-nogo">
          <h4>Out of scope</h4>
          <ul>{noGo.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <RawToggle label="raw 01_REQUIREMENTS.json">{JSON.stringify(parsed, null, 2)}</RawToggle>
    </div>
  );
}

export default function ArtifactsTab({ artifacts }) {
  const [selected, setSelected] = useState(null);
  const chain = artifacts?.chain ?? [];
  const contents = artifacts?.contents ?? {};

  const active = selected ?? chain.find(e => e.present)?.name ?? null;
  const activeContent = active ? contents[active] : null;

  return (
    <div className="tab-artifacts" data-testid="tab-artifacts">
      <aside className="chain-list" data-testid="chain-list">
        {chain.map(e => (
          <button
            key={e.name}
            className={`chain-item ${active === e.name ? 'active' : ''} ${e.present ? '' : 'absent'}`}
            disabled={!e.present}
            onClick={() => setSelected(e.name)}
            data-testid="chain-item"
            data-present={e.present ? 'true' : 'false'}
          >
            <span className="mono">{e.name}</span>
            {!e.present && (
              <span className="chain-absent">
                {OPTIONAL.has(e.name) ? 'not produced (optional)' : 'not produced'}
              </span>
            )}
            {e.error && <span className="chain-error">unreadable</span>}
            {e.truncated && <span className="chain-trunc">truncated</span>}
          </button>
        ))}
      </aside>

      <div className="artifact-content" data-testid="artifact-content">
        {!activeContent && <div className="dim">Select a produced artifact.</div>}
        {activeContent?.kind === 'md' && (
          <>
            {activeContent.truncated && (
              <div className="trunc-note" data-testid="trunc-note">Showing the first 1 MiB of this file.</div>
            )}
            {renderMarkdown(activeContent.raw)}
          </>
        )}
        {activeContent?.kind === 'json' && active === '01_REQUIREMENTS.json' && (
          <PrdView parsed={activeContent.parsed} />
        )}
        {activeContent?.kind === 'json' && active !== '01_REQUIREMENTS.json' && (
          <div className="json-view">
            <div className="dim">{active}</div>
            <RawToggle label={`raw ${active}`}>{JSON.stringify(activeContent.parsed, null, 2)}</RawToggle>
          </div>
        )}
      </div>
    </div>
  );
}
