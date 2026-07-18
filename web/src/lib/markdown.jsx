/**
 * Module: web/src/lib/markdown
 * Purpose: Minimal Markdown → React-element renderer (ADR-Q2). Covers the
 *          constructs Aitri's own artifact templates emit: headings, paragraphs,
 *          bold/italic, inline code, fenced code blocks, unordered/ordered lists,
 *          blockquotes, links, horizontal rules, and simple pipe tables.
 *
 * XSS-safe BY CONSTRUCTION: every text node is a React child (React escapes it),
 * and raw HTML in the source is rendered as inert text. There is intentionally
 * NO dangerouslySetInnerHTML anywhere in this module or the feature — a test
 * pins its absence (TC-152f / TC-058f).
 */

import React from 'react';

/**
 * Per-render image resolver (FR-016). Set by renderMarkdown for the duration of a
 * single synchronous render pass; read by renderInline's image token. `null` when
 * a caller passes no resolver — then relative images degrade to an alt-text
 * placeholder (never a broken/exec'd embed). Not reentrant by design: rendering is
 * a single synchronous pass, so a module-scoped handle avoids threading it through
 * every renderInline call site.
 */
let _resolveImage = null;

/** Only inline image data-URIs of the supported raster/vector types (FR-016). */
const IMG_DATA_URI = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i;

/**
 * Render a Markdown image token to an inline <img> when its source resolves, or an
 * alt-text placeholder otherwise — the document keeps rendering either way (FR-016).
 * @param {string} alt
 * @param {string} src - data-URI or a relative artifact path.
 * @param {string} key
 */
function renderImage(alt, src, key) {
  if (IMG_DATA_URI.test(src)) return <img key={key} className="md-img" src={src} alt={alt} />;
  const resolved = _resolveImage ? _resolveImage(src) : null;
  if (resolved && resolved.dataUri) return <img key={key} className="md-img" src={resolved.dataUri} alt={alt} />;
  return (
    <span key={key} className="md-img-missing" title={src} role="img" aria-label={alt || 'image'}>
      🖼 {alt || src}
    </span>
  );
}

// Inline spans: code, bold, italic (asterisk or underscore), images, links. React
// escapes every text node, so raw HTML in the source renders inert.
function renderInline(text, keyPrefix) {
  const nodes = [];
  let rest = text;
  let k = 0;
  // Ordered by precedence; code first so its content is not further parsed. The
  // image token precedes the link token so `![alt](src)` matches as an image.
  const patterns = [
    { re: /`([^`]+)`/, make: m => <code key={`${keyPrefix}-${k}`} className="md-code">{m[1]}</code> },
    { re: /!\[([^\]]*)\]\(([^)\s]+)\)/, make: m => renderImage(m[1], m[2], `${keyPrefix}-${k}`) },
    { re: /\*\*([^*]+)\*\*/, make: m => <strong key={`${keyPrefix}-${k}`}>{renderInline(m[1], `${keyPrefix}-${k}b`)}</strong> },
    { re: /(?:\*([^*]+)\*|_([^_]+)_)/, make: m => <em key={`${keyPrefix}-${k}`}>{m[1] ?? m[2]}</em> },
    { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: m => renderLink(m[1], m[2], `${keyPrefix}-${k}`) },
  ];
  // Greedy scan: find the earliest match among patterns, emit text before it.
  // Bounded by input length; no catastrophic backtracking (simple alternations).
  let guard = 0;
  while (rest && guard++ < 5000) {
    let best = null;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.index)) best = { ...p, m, index: m.index };
    }
    if (!best) {
      nodes.push(rest);
      break;
    }
    if (best.index > 0) nodes.push(rest.slice(0, best.index));
    nodes.push(best.make(best.m));
    k += 1;
    rest = rest.slice(best.index + best.m[0].length);
  }
  return nodes;
}

/** Links: only http(s), mailto, and in-page anchors; anything else renders as text. */
function renderLink(label, href, key) {
  const safe = /^(https?:\/\/|mailto:|#|\/)/i.test(href);
  if (!safe) return `[${label}](${href})`;
  return (
    <a key={key} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">
      {label}
    </a>
  );
}

/**
 * Render a Markdown string to a React fragment.
 * @param {string} src
 * @param {{ resolveImage?: (path:string) => ({dataUri:string}|null) }} [opts]
 *        resolveImage maps a relative image path to a data-URI (or null when it
 *        cannot be resolved → alt-text placeholder). FR-016.
 * @returns {JSX.Element}
 */
export function renderMarkdown(src, opts = {}) {
  _resolveImage = typeof opts.resolveImage === 'function' ? opts.resolveImage : null;
  if (typeof src !== 'string') return <div className="md" />;
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i += 1; // closing fence
      blocks.push(<pre key={key++} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = `h${Math.min(level + 1, 6)}`; // h1 source → h2 (page already has an h1)
      blocks.push(<Tag key={key++} className={`md-h md-h${level}`}>{renderInline(h[2], `h${key}`)}</Tag>);
      i += 1;
      continue;
    }
    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="md-hr" />);
      i += 1;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key++} className="md-quote">{renderInline(buf.join(' '), `q${key}`)}</blockquote>);
      continue;
    }
    // Pipe table (header row + separator + body)
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = row => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const header = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      blocks.push(
        <table key={key++} className="md-table">
          <thead><tr>{header.map((c, ci) => <th key={ci}>{renderInline(c, `th${key}-${ci}`)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(<ul key={key++} className="md-ul">{items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>)}</ul>);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(<ol key={key++} className="md-ol">{items.map((it, ii) => <li key={ii}>{renderInline(it, `oli${key}-${ii}`)}</li>)}</ol>);
      continue;
    }
    // Blank line
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    // Paragraph (accumulate until a blank line or a block starter)
    const buf = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+\.\s+|^(---+|\*\*\*+|___+)\s*$/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(<p key={key++} className="md-p">{renderInline(buf.join(' '), `p${key}`)}</p>);
  }

  return <div className="md">{blocks}</div>;
}
