/**
 * Module: web/src/components/ArtifactsExplorer
 * Purpose: v0.3.0 Artifacts explorer (FR-015) + reader (FR-016). Left: a per-phase
 *          tree with a rolled-up folder glyph (✓/○/✕), each file shown by its
 *          product name (FR-019) with the technical filename as secondary text,
 *          size, age and a status chip. Right: the reader — Markdown formatted with
 *          inline images, JSON as a human-readable projection, images inline.
 *          Selecting a file opens it; re-selecting toggles it closed.
 *
 * @aitri-trace FR-ID: FR-015, FR-016, FR-019
 *              US-ID: US-015, US-016, US-019
 *              AC-ID: AC-015-1, AC-015-2, AC-015-3, AC-016-1, AC-016-2
 *              TC-ID: TC-015e, TC-015f, TC-016h, TC-JSON-016h
 */

import React, { useState, useEffect, useCallback } from 'react';
import { productName } from '../lib/names.js';
import { fetchArtifact, fetchDetail } from '../lib/detailApi.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { JsonView } from '../lib/jsonView.jsx';

const STATUS_META = Object.freeze({
  approved: { glyph: '✓', cls: 'healthy', label: 'approved' },
  pending: { glyph: '○', cls: 'warning', label: 'pending' },
  rejected: { glyph: '✕', cls: 'error', label: 'rejected' },
  empty: { glyph: '∅', cls: 'dim', label: 'empty' },
});

/** Human size string. */
function sizeOf(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Relative age string from an epoch-ms mtime. */
function ageOf(mtimeMs) {
  if (!mtimeMs) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - mtimeMs) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Extract `![alt](path)` relative image refs from Markdown (skips data:/http URIs). */
function imageRefs(md) {
  const out = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(md))) {
    const src = m[1];
    if (!/^(data:|https?:\/\/)/i.test(src)) out.push(src);
  }
  return out;
}

/**
 * @param {{ id:string, tree?:Array, scopes?:string[], scope?:string, feature?:string }} props
 *   When `tree` is passed it renders statically (tests). Otherwise it fetches the
 *   tree for the selected scope and shows a scope selector (product / each feature),
 *   so feature artifacts — including BUILD_PLAN.md — are reachable (FR-015/019).
 */
export default function ArtifactsExplorer({ id, tree: treeProp, scopes = ['product'], scope: scopeProp, feature }) {
  const staticMode = Array.isArray(treeProp);
  const [scope, setScope] = useState(scopeProp ?? 'product');
  const [tree, setTree] = useState(treeProp ?? []);
  const [treeState, setTreeState] = useState({ loading: !staticMode, error: null });
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState({ loading: false, data: null, error: null });
  const [images, setImages] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const toggleFolder = (phase) => setCollapsed((c) => ({ ...c, [phase]: !c[phase] }));

  // Fetch the artifact tree for the selected scope (skipped in static/test mode).
  useEffect(() => {
    if (staticMode) return;
    let cancelled = false;
    setTreeState({ loading: true, error: null });
    setSelected(null);
    setContent({ loading: false, data: null, error: null });
    (async () => {
      const res = await fetchDetail(id, scope);
      if (cancelled) return;
      if (res.ok) { setTree(res.payload.artifacts?.tree ?? []); setTreeState({ loading: false, error: null }); }
      else { setTree([]); setTreeState({ loading: false, error: res.error }); }
    })();
    return () => { cancelled = true; };
  }, [id, scope, staticMode]);

  // Feature scope prefixes product names with the feature (FR-019).
  const activeFeature = feature ?? (scope !== 'product' ? scope : undefined);

  const load = useCallback(async (name) => {
    setContent({ loading: true, data: null, error: null });
    setImages({});
    const res = await fetchArtifact(id, name, scope);
    if (res.ok) setContent({ loading: false, data: res.content, error: null });
    else setContent({ loading: false, data: null, error: res });
  }, [id, scope]);

  // Toggle: clicking the open file closes the reader (AC-015-2).
  const onSelect = useCallback((name) => {
    if (name === selected) {
      setSelected(null);
      setContent({ loading: false, data: null, error: null });
      return;
    }
    setSelected(name);
    load(name);
  }, [selected, load]);

  // Resolve inline Markdown images lazily via the confined content endpoint.
  useEffect(() => {
    if (content.data?.kind !== 'markdown') return;
    const refs = imageRefs(content.data.content);
    if (refs.length === 0) return;
    let cancelled = false;
    (async () => {
      const map = {};
      for (const ref of refs) {
        const r = await fetchArtifact(id, ref, scope);
        map[ref] = r.ok && r.content.kind === 'image' ? r.content.dataUri : null;
      }
      if (!cancelled) setImages(map);
    })();
    return () => { cancelled = true; };
  }, [content.data, id, scope]);

  const resolveImage = useCallback((p) => (images[p] ? { dataUri: images[p] } : null), [images]);

  return (
    <section className="d-section artifacts-explorer" data-testid="section-artifacts">
      <div className="ax-header">
        <h2 className="d-section__title">// artifacts</h2>
        {!staticMode && scopes.length > 1 && (
          <label className="ax-scope">
            <span className="dim mono">scope</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="artifact-scope">
              {scopes.map((s) => <option key={s} value={s}>{s === 'product' ? 'product' : `feature: ${s}`}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="ax-grid">
        <aside className="ax-tree" data-testid="artifacts-tree">
          {treeState.loading && <div className="d-empty" data-testid="tree-loading">loading artifacts…</div>}
          {treeState.error && <div className="d-empty" data-testid="tree-error">// could not load artifacts: {treeState.error}</div>}
          {!treeState.loading && !treeState.error && tree.length === 0 && <div className="d-empty">// no artifacts</div>}
          {tree.map((group) => {
            const meta = STATUS_META[group.status] ?? STATUS_META.empty;
            return (
              <div key={group.phase} className="ax-folder" data-testid="artifact-folder" data-phase={group.phase}>
                <button
                  className="ax-folder__head"
                  onClick={() => toggleFolder(group.phase)}
                  aria-expanded={!collapsed[group.phase]}
                  data-testid="artifact-folder-toggle"
                >
                  <span className="ax-caret mono">{collapsed[group.phase] ? '▸' : '▾'}</span>
                  <span className={`ax-glyph color--${meta.cls}`}>{group.glyph}</span>
                  <span className="ax-folder__label mono">{group.label}</span>
                  <span className="ax-folder__count mono">{group.files.length || ''}</span>
                </button>
                {collapsed[group.phase] ? null : group.files.length === 0 ? (
                  <div className="ax-empty-row" data-testid="artifact-empty-phase">// no artifacts in this phase yet</div>
                ) : (
                  group.files.map((f) => {
                    const fmeta = STATUS_META[f.status] ?? STATUS_META.pending;
                    return (
                      <button
                        key={f.technicalName}
                        className={`ax-file ${selected === f.technicalName ? 'active' : ''}`}
                        onClick={() => onSelect(f.technicalName)}
                        data-testid="artifact-file"
                        data-name={f.technicalName}
                      >
                        <span className="ax-file__name">{productName(f.technicalName, activeFeature ? { feature: activeFeature } : undefined)}</span>
                        <span className="ax-file__tech mono" title={f.technicalName}>{f.technicalName}</span>
                        <span className="ax-file__meta mono">{sizeOf(f.size)} · {ageOf(f.mtime)}</span>
                        <span className={`status-badge status-badge--${fmeta.cls} ax-file__chip`}>{fmeta.glyph} {fmeta.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </aside>

        <div className="ax-reader" data-testid="artifact-reader">
          {!selected && (
            <div className="ax-reader__empty" data-testid="reader-empty">// select a file to read</div>
          )}
          {selected && content.loading && <div className="ax-reader__empty" data-testid="reader-loading">Rendering…</div>}
          {selected && content.error && (
            <div className="ax-reader__empty" data-testid="reader-error">
              // could not load: {content.error.error}
            </div>
          )}
          {selected && content.data && (
            <div className="ax-reader__body">
              <div className="ax-reader__title mono">{productName(selected, activeFeature ? { feature: activeFeature } : undefined)}
                <span className="ax-reader__tech"> · {selected}</span>
              </div>
              {content.data.kind === 'markdown' && renderMarkdown(content.data.content, { resolveImage })}
              {content.data.kind === 'json' && !content.data.parseError && <JsonView data={content.data.parsed} />}
              {content.data.kind === 'json' && content.data.parseError && (
                <div className="d-empty" data-testid="reader-parse-error">// {selected} could not be parsed as JSON</div>
              )}
              {content.data.kind === 'image' && <img className="ax-img" src={content.data.dataUri} alt={selected} />}
              {content.data.kind === 'other' && <pre className="md-pre"><code>{content.data.content}</code></pre>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
