import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';
import type { JSONContent } from '@tiptap/core';
import { baseExtensions } from './editor/extensions';

export interface Rendered {
  html: string;
  text: string;
  readingMinutes: number;
  coverImage: string | null;
}

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

export function isDoc(v: unknown): v is JSONContent {
  return !!v && typeof v === 'object' && (v as JSONContent).type === 'doc';
}

function walk(node: JSONContent, out: { text: string[]; cover: string | null }) {
  if (node.type === 'text' && node.text) out.text.push(node.text);
  if (node.type === 'customEmoji') out.text.push(`:${node.attrs?.name}:`);
  if (node.type === 'image' && !out.cover && typeof node.attrs?.src === 'string') out.cover = node.attrs.src;
  const blockish = node.type !== 'text' && node.type !== 'customEmoji' && node.type !== 'hardBreak';
  for (const c of node.content ?? []) walk(c, out);
  if (blockish) out.text.push('\n');
}

/** TipTap JSON (source of truth) -> HTML + plain text + reading time. */
export function renderDoc(doc: JSONContent): Rendered {
  const html = renderToHTMLString({ content: doc, extensions: baseExtensions });
  const out = { text: [] as string[], cover: null as string | null };
  walk(doc, out);
  const text = out.text.join('').replace(/\n{2,}/g, '\n').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return { html, text, readingMinutes: Math.max(1, Math.round(words / 220)), coverImage: out.cover };
}
