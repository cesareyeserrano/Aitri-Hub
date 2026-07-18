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
import { fetchArtifact } from '../lib/detailApi.js';
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
 * @param {{ id:string, tree:Array, scope?:string, feature?:string }} props
 */
export default function ArtifactsExplorer({ id, tree = [], scope, feature }) {
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState({ loading: false, data: null, error: null });
  const [images, setImages] = useState({});

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
      <h2 className="d-section__title">// artifacts</h2>
      <div className="ax-grid">
        <aside className="ax-tree" data-testid="artifacts-tree">
          {tree.length === 0 && <div className="d-empty">// no artifacts</div>}
          {tree.map((group) => {
            const meta = STATUS_META[group.status] ?? STATUS_META.empty;
            return (
              <div key={group.phase} className="ax-folder" data-testid="artifact-folder" data-phase={group.phase}>
                <div className="ax-folder__head">
                  <span className={`ax-glyph color--${meta.cls}`}>{group.glyph}</span>
                  <span className="ax-folder__label mono">{group.label}</span>
                </div>
                {group.files.length === 0 ? (
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
                        <span className="ax-file__name">{productName(f.technicalName, feature ? { feature } : undefined)}</span>
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
              <div className="ax-reader__title mono">{productName(selected, feature ? { feature } : undefined)}
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
