import { u, emojiUrl } from '../url';

/**
 * Browser-side emoji data: custom Hack Club emoji (/api/emojis, compact) +
 * unicode emoji (/api/emojis/unicode). Loaded once, lazily, shared by the
 * picker, the editor autocomplete/input rule and the reactions bar.
 */

export interface CustomItem {
  kind: 'custom';
  key: string; // ":name:"
  name: string;
  aliasOf?: string;
}

export interface UnicodeItem {
  kind: 'unicode';
  key: string; // the character(s)
  char: string;
  codes: string[]; // iamcal shortcodes, first is canonical
  group: number;
  label: string;
}

export type EmojiItem = CustomItem | UnicodeItem;

export interface EmojiData {
  custom: CustomItem[];
  unicode: UnicodeItem[];
  customByName: Map<string, CustomItem>;
  unicodeByCode: Map<string, UnicodeItem>;
  unicodeByChar: Map<string, UnicodeItem>;
}

export const GROUP_NAMES: Record<number, string> = {
  0: 'smileys & emotion',
  1: 'people & body',
  3: 'animals & nature',
  4: 'food & drink',
  5: 'travel & places',
  6: 'activities',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
};

let promise: Promise<EmojiData> | null = null;
let ready: EmojiData | null = null;

export function loadEmojiData(): Promise<EmojiData> {
  if (promise) return promise;
  promise = Promise.all([
    fetch(u('/api/emojis')).then((r) => (r.ok ? r.json() : [])),
    fetch(u('/api/emojis/unicode')).then((r) => (r.ok ? r.json() : [])),
  ])
    .then(([c, un]: [{ n: string; a?: string }[], [string, string, number, string][]]) => {
      const custom: CustomItem[] = c.map((e) => ({ kind: 'custom', key: `:${e.n}:`, name: e.n, aliasOf: e.a }));
      const unicode: UnicodeItem[] = un.map(([char, codes, group, label]) => ({
        kind: 'unicode',
        key: char,
        char,
        codes: codes.split(' '),
        group,
        label,
      }));
      const unicodeByCode = new Map<string, UnicodeItem>();
      for (const e of unicode) for (const code of e.codes) if (!unicodeByCode.has(code)) unicodeByCode.set(code, e);
      ready = {
        custom,
        unicode,
        customByName: new Map(custom.map((e) => [e.name, e])),
        unicodeByCode,
        unicodeByChar: new Map(unicode.map((e) => [e.char, e])),
      };
      return ready;
    })
    .catch((err) => {
      promise = null; // allow retry
      throw err;
    });
  return promise;
}

export const emojiDataSync = () => ready;

export const shortName = (e: EmojiItem) => (e.kind === 'custom' ? e.name : e.codes[0]);

/**
 * Resolve a shortcode the way Slack does. Unicode wins over a custom emoji of
 * the same name, so :sob: is always the real 😭.
 */
export function resolveShortcode(data: EmojiData, code: string): EmojiItem | undefined {
  const c = code.toLowerCase();
  return data.unicodeByCode.get(c) ?? data.customByName.get(c);
}

/** Turn a stored reaction key (":name:" or a char) back into an item. */
export function itemFromKey(data: EmojiData | null, key: string): EmojiItem {
  const m = /^:(.+):$/.exec(key);
  if (m) return data?.customByName.get(m[1]) ?? { kind: 'custom', key, name: m[1] };
  return data?.unicodeByChar.get(key) ?? { kind: 'unicode', key, char: key, codes: [key], group: -1, label: key };
}

/**
 * Ranked search: exact > prefix > word-prefix > substring, shorter names first.
 * Linear over ~66k names, which is a few ms: fine per keystroke.
 */
export function searchEmoji(
  data: EmojiData,
  query: string,
  opts: { limit?: number; kinds?: ('custom' | 'unicode')[] } = {},
): EmojiItem[] {
  const q = query.toLowerCase().replace(/^:|:$/g, '').trim();
  if (!q) return [];
  const limit = opts.limit ?? 50;
  const kinds = opts.kinds ?? ['unicode', 'custom'];
  const buckets: EmojiItem[][] = [[], [], [], []];

  const rank = (name: string) => {
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(`_${q}`) || name.includes(`-${q}`)) return 2;
    if (name.includes(q)) return 3;
    return -1;
  };

  if (kinds.includes('unicode')) {
    for (const e of data.unicode) {
      let best = -1;
      for (const c of e.codes) {
        const r = rank(c);
        if (r !== -1 && (best === -1 || r < best)) best = r;
      }
      if (best === -1 && q.length > 2 && e.label.toLowerCase().includes(q)) best = 3;
      if (best !== -1) buckets[best].push(e);
    }
  }
  if (kinds.includes('custom')) {
    for (const e of data.custom) {
      const r = rank(e.name);
      if (r !== -1) buckets[r].push(e);
    }
  }

  const out: EmojiItem[] = [];
  for (const b of buckets) {
    // within a bucket: unicode first (Slack-like), then shorter names
    b.sort((a, z) => (a.kind === z.kind ? shortName(a).length - shortName(z).length : a.kind === 'unicode' ? -1 : 1));
    for (const e of b) {
      out.push(e);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ---------- recently used (localStorage) ----------

const RECENT_KEY = 'blog:recent-emoji';
const RECENT_MAX = 27;

export function getRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(key: string) {
  try {
    const next = [key, ...getRecent().filter((k) => k !== key)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked; recents are a nicety */
  }
}

export { emojiUrl };
