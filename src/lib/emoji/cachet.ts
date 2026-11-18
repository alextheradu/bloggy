import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { CACHET_URL } from 'astro:env/server';
import { getObjectBytes, putObject } from '../s3';

/**
 * Hack Club Slack custom emoji, sourced from Cachet.
 *
 * GET /emojis is ~15 MB / ~66k entries, so it is fetched server side only,
 * kept in memory, refreshed every few hours (stale-while-revalidate), and
 * snapshotted to S3 so a cold start can still serve if Cachet is down.
 * The browser only ever sees the compact `[{ n, a? }]` list.
 */

interface CachetEmoji {
  name: string;
  alias: string | null;
  imageUrl: string;
}

export interface CustomEmoji {
  /** final https image url (aliases resolved) */
  url: string;
  /** name this is an alias of, if any */
  aliasOf?: string;
}

interface State {
  byName: Map<string, CustomEmoji>;
  loadedAt: number;
  compactGz: Buffer;
  compactJson: string;
  etag: string;
}

const REFRESH_MS = 4 * 60 * 60 * 1000;
const SNAPSHOT_KEY = 'cache/cachet-emojis.json';

const g = globalThis as unknown as {
  __cachet?: { state: State | null; loading: Promise<State> | null };
};
const store = (g.__cachet ??= { state: null, loading: null });

const base = () => CACHET_URL.replace(/\/+$/, '');

export const isValidEmojiName = (name: string) =>
  name.length > 0 && name.length <= 100 && !/[\s:/\\?#]/.test(name);

function build(raw: CachetEmoji[]): State {
  const rawByName = new Map(raw.map((e) => [e.name, e]));
  const byName = new Map<string, CustomEmoji>();

  for (const e of raw) {
    if (!isValidEmojiName(e.name)) continue;
    // Follow "alias:foo" image urls (Cachet leaves a handful unresolved).
    let url = e.imageUrl;
    let hops = 0;
    while (url?.startsWith('alias:') && hops++ < 5) url = rawByName.get(url.slice(6))?.imageUrl ?? '';
    if (!url || !url.startsWith('https://')) continue; // points at a standard emoji / dangling
    byName.set(e.name, e.alias ? { url, aliasOf: e.alias } : { url });
  }

  const compact = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, v]) => (v.aliasOf && byName.has(v.aliasOf) ? { n, a: v.aliasOf } : { n }));
  const compactJson = JSON.stringify(compact);
  return {
    byName,
    loadedAt: Date.now(),
    compactJson,
    compactGz: gzipSync(compactJson, { level: 9 }),
    etag: `"${createHash('sha1').update(compactJson).digest('hex').slice(0, 20)}"`,
  };
}

async function fetchFromCachet(): Promise<State> {
  const res = await fetch(`${base()}/emojis`, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`cachet /emojis ${res.status}`);
  const raw = (await res.json()) as CachetEmoji[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('cachet /emojis: empty');
  const state = build(raw);
  // Snapshot (name -> [url, alias]) for cold starts; best effort.
  const snap: Record<string, [string, string?]> = {};
  for (const [n, v] of state.byName) snap[n] = v.aliasOf ? [v.url, v.aliasOf] : [v.url];
  putObject(SNAPSHOT_KEY, JSON.stringify(snap), 'application/json').catch((err) =>
    console.warn('[cachet] snapshot write failed', err),
  );
  console.log(`[cachet] loaded ${state.byName.size} custom emoji`);
  return state;
}

async function loadFromSnapshot(): Promise<State | null> {
  const bytes = await getObjectBytes(SNAPSHOT_KEY).catch(() => null);
  if (!bytes) return null;
  const snap = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, [string, string?]>;
  const raw: CachetEmoji[] = Object.entries(snap).map(([name, [imageUrl, alias]]) => ({
    name,
    imageUrl,
    alias: alias ?? null,
  }));
  const state = build(raw);
  state.loadedAt = 0; // mark stale so a real refresh is attempted soon
  console.log(`[cachet] loaded ${state.byName.size} custom emoji from S3 snapshot`);
  return state;
}

function refresh(): Promise<State> {
  if (store.loading) return store.loading;
  store.loading = fetchFromCachet()
    .then((s) => (store.state = s))
    .catch(async (err) => {
      console.warn('[cachet] refresh failed:', err?.message ?? err);
      if (store.state) return store.state;
      const snap = await loadFromSnapshot();
      if (snap) return (store.state = snap);
      throw err;
    })
    .finally(() => {
      store.loading = null;
    });
  return store.loading;
}

/** Returns the emoji state, loading it on first use and refreshing in the background when stale. */
export async function getCustomEmojis(): Promise<State> {
  const s = store.state;
  if (!s) return refresh();
  if (Date.now() - s.loadedAt > REFRESH_MS) refresh().catch(() => {});
  return s;
}

/** Non-blocking lookup: only answers if the list is already in memory. */
export function peekCustomEmoji(name: string): CustomEmoji | undefined {
  return store.state?.byName.get(name);
}

export async function hasCustomEmoji(name: string): Promise<boolean> {
  return (await getCustomEmojis()).byName.has(name);
}

/**
 * Resolve a custom emoji to its upstream image url. Uses the in-memory list if
 * loaded; otherwise asks Cachet for just that one (so the first image request
 * after boot doesn't wait on the 15 MB list).
 */
export async function resolveCustomEmojiUrl(name: string): Promise<string | null> {
  if (!isValidEmojiName(name)) return null;
  const hit = peekCustomEmoji(name);
  if (hit) return hit.url;
  if (store.state) return null; // list loaded and it's not there
  getCustomEmojis().catch(() => {}); // warm in the background
  try {
    const res = await fetch(`${base()}/emojis/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const e = (await res.json()) as CachetEmoji;
    let url = e.imageUrl;
    if (url?.startsWith('alias:')) return resolveCustomEmojiUrl(url.slice(6));
    return url?.startsWith('https://') ? url : null;
  } catch {
    return null;
  }
}

/** Slack avatar for an HCA user's slack id, via Cachet. */
export async function resolveSlackAvatarUrl(slackId: string): Promise<string | null> {
  if (!/^[A-Z0-9]{5,20}$/.test(slackId)) return null;
  try {
    const res = await fetch(`${base()}/users/${slackId}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { imageUrl?: string };
    return j.imageUrl?.startsWith('https://') ? j.imageUrl : null;
  } catch {
    return null;
  }
}
