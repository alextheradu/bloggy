// Every internal link/asset goes through `u()` so the app owns its /blog
// prefix (Traefik forwards with Strip Path OFF). Safe for client + server.
const RAW_BASE = import.meta.env.BASE_URL || '/';
export const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE; // "/blog"

export function u(path = '/'): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path; // already absolute
  const p = path.startsWith('/') ? path : `/${path}`;
  if (p === '/') return BASE || '/';
  if (BASE && (p === BASE || p.startsWith(`${BASE}/`))) return p;
  return `${BASE}${p}`;
}

/** /blog/emoji/<name> — proxied custom emoji image, never slack-edge directly. */
export const emojiUrl = (name: string) => u(`/emoji/${encodeURIComponent(name)}`);

/** Only allow same-site relative redirects back into the blog. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return u('/');
  if (!(next === BASE || next.startsWith(`${BASE}/`) || next.startsWith(`${BASE}?`))) return u('/');
  return next;
}
