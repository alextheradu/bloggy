import { gzipSync } from 'node:zlib';
import compact from 'emojibase-data/en/compact.json';
import iamcal from 'emojibase-data/en/shortcodes/iamcal.json';

/**
 * Standard unicode emoji with Slack (iamcal) shortcodes, so :sob:, :joy:
 * etc. behave like Slack. Built once per process from emojibase.
 */

interface CompactEmoji {
  hexcode: string;
  label: string;
  unicode: string;
  group?: number;
  order?: number;
  skins?: CompactEmoji[];
}

const codes = iamcal as Record<string, string | string[]>;
const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** [char, "shortcode other_code", group, label]: compact wire format for the picker */
export type UnicodeRow = [string, string, number, string];

const rows: UnicodeRow[] = [];
const byShortcode = new Map<string, string>();
const shortcodeOf = new Map<string, string>();
const valid = new Set<string>();

for (const e of (compact as CompactEmoji[]).slice().sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))) {
  valid.add(e.unicode);
  for (const s of e.skins ?? []) valid.add(s.unicode);
  if (e.group == null || e.group === 2) continue; // skip components (skin tone swatches etc.)
  const sc = asList(codes[e.hexcode]);
  if (sc.length === 0) continue; // only expose emoji reachable by a slack shortcode
  for (const c of sc) if (!byShortcode.has(c)) byShortcode.set(c, e.unicode);
  shortcodeOf.set(e.unicode, sc[0]);
  rows.push([e.unicode, sc.join(' '), e.group, e.label]);
}

export const unicodeRows = rows;
export const unicodeFromShortcode = (code: string) => byShortcode.get(code);
export const shortcodeForUnicode = (char: string) => shortcodeOf.get(char);
export const isUnicodeEmoji = (s: string) => valid.has(s);

let gz: Buffer | null = null;
export const unicodeRowsJson = JSON.stringify(rows);
export const unicodeRowsGz = () => (gz ??= gzipSync(unicodeRowsJson, { level: 9 }));
