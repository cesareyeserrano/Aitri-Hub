/**
 * Module: collector/relative-time
 * Purpose: Browser-safe relative-time formatters used by both the Hub web UI
 *          (ProjectCard) and the Node-side snapshot-reader. Has zero Node
 *          dependencies so it can be bundled by Vite for the browser.
 *
 * @aitri-trace FR-ID: FR-016, TC-ID: TC-016h, TC-016e1
 */

const ABS_DATE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatRelativeTime(at, now = new Date()) {
  const atMs  = at instanceof Date ? at.getTime()  : new Date(at).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return '';
  const delta = Math.max(0, nowMs - atMs);

  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < ABS_DATE_THRESHOLD_MS) return `${Math.floor(delta / 86_400_000)}d ago`;

  const d = new Date(atMs);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatVerboseRelative(at, now) {
  const atMs  = at instanceof Date ? at.getTime()  : new Date(at).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return '';
  const delta = Math.max(0, nowMs - atMs);
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) {
    const m = Math.floor(delta / 60_000);
    return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (delta < 86_400_000) {
    const h = Math.floor(delta / 3_600_000);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  if (delta < ABS_DATE_THRESHOLD_MS) {
    const d = Math.floor(delta / 86_400_000);
    return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  }
  const d = new Date(atMs);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatLastSessionLine(lastSession, now = new Date()) {
  if (!lastSession || !lastSession.event || !lastSession.agent || !lastSession.at) return null;
  return `last: ${lastSession.event} by ${lastSession.agent} · ${formatVerboseRelative(lastSession.at, now)}`;
}
