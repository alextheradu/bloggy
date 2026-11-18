import { Extension, InputRule } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { Editor, Range } from '@tiptap/core';
import { emojiDataSync, resolveShortcode, searchEmoji, shortName, type EmojiItem } from '@/lib/emoji/client';
import { suggestionRenderer } from './suggest-render';
import { emojiMenuIcon, slashItems, type SlashItem } from './slash-items';

export function insertEmoji(editor: Editor, item: EmojiItem, range?: Range) {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  if (item.kind === 'custom') chain.insertCustomEmoji(item.name);
  else chain.insertContent(item.char);
  chain.run();
}

/** "/" block menu (Slack canvas-style). */
export const SlashCommand = Extension.create<{ onImage: () => void; onLink: () => void }>({
  name: 'slashCommand',
  addOptions() {
    return { onImage: () => {}, onLink: () => {} };
  },
  addProseMirrorPlugins() {
    const ext = this;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slash'),
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return slashItems.filter((i) => !q || i.label.includes(q) || i.keywords.some((k) => k.startsWith(q))).slice(0, 12);
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor, { onImage: ext.options.onImage, onLink: ext.options.onLink });
        },
        render: suggestionRenderer({
          title: 'blocks',
          empty: 'no matching block',
          toItems: (items: SlashItem[]) => items.map((i) => ({ ...i, id: i.id })),
        }),
      }),
    ];
  },
});

/** ":" + 2 chars opens inline emoji autocomplete, like Slack. */
export const EmojiSuggestion = Extension.create({
  name: 'emojiSuggestion',
  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiItem>({
        editor: this.editor,
        pluginKey: new PluginKey('emojiSuggest'),
        char: ':',
        allowSpaces: false,
        allowedPrefixes: [' ', '(', ' '],
        items: ({ query }) => {
          const data = emojiDataSync();
          if (!data || query.length < 2 || query.endsWith(':')) return [];
          return searchEmoji(data, query, { limit: 8 });
        },
        command: ({ editor, range, props }) => insertEmoji(editor, (props as unknown as { raw?: EmojiItem }).raw ?? props, range),
        render: suggestionRenderer({
          toItems: (items: EmojiItem[]) =>
            items.map((e) => ({ id: e.key, label: `:${shortName(e)}:`, icon: emojiMenuIcon(e), raw: e })),
        }),
      }),
    ];
  },
});

/** Typing a complete ":sob:" converts it in place (unicode wins over custom on name clashes). */
export const EmojiInputRule = Extension.create({
  name: 'emojiInputRule',
  addInputRules() {
    return [
      new InputRule({
        find: /(?<=^|[\s(])(:([^\s:]{1,100}):)$/,
        handler: ({ state, range, match }) => {
          const data = emojiDataSync();
          if (!data) return null;
          const item = resolveShortcode(data, match[2]);
          if (!item) return null;
          const from = range.to - match[1].length;
          if (item.kind === 'custom') {
            const node = state.schema.nodes.customEmoji.create({ name: item.name });
            state.tr.replaceWith(from, range.to, node);
          } else {
            state.tr.insertText(item.char, from, range.to);
          }
        },
      }),
    ];
  },
});

/**
 * Convert complete ":code:" runs already in the doc (typed before the emoji
 * list finished loading). Skips code blocks and inline code.
 */
export function convertPendingShortcodes(editor: Editor) {
  const data = emojiDataSync();
  if (!data) return;
  const { state } = editor;
  const hits: { from: number; to: number; item: EmojiItem }[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (parent?.type.name === 'codeBlock') return false;
    if (!node.isText || node.marks.some((m) => m.type.name === 'code')) return;
    const re = /(?<=^|[\s(]):([^\s:]{1,100}):/g;
    for (const m of node.text!.matchAll(re)) {
      const item = resolveShortcode(data, m[1]);
      if (item) hits.push({ from: pos + m.index!, to: pos + m.index! + m[0].length, item });
    }
  });
  if (!hits.length) return;
  const tr = state.tr;
  for (const h of hits.reverse()) {
    if (h.item.kind === 'custom') tr.replaceWith(h.from, h.to, state.schema.nodes.customEmoji.create({ name: h.item.name }));
    else tr.insertText(h.item.char, h.from, h.to);
  }
  editor.view.dispatch(tr);
}
