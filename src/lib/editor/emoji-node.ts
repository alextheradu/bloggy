import { Node } from '@tiptap/core';
import { emojiUrl } from '../url';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customEmoji: {
      insertCustomEmoji: (name: string) => ReturnType;
    };
  }
}

/**
 * Inline atom for Hack Club Slack custom emoji. Renders exactly like the
 * published HTML: <img class="emoji" src="/blog/emoji/name" alt=":name:">.
 * The browser only ever hits our proxy, never slack-edge.com.
 */
export const CustomEmoji = Node.create({
  name: 'customEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-emoji'),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-emoji]' }];
  },

  renderHTML({ node }) {
    const name = String(node.attrs.name ?? '');
    return [
      'img',
      {
        class: 'emoji',
        'data-emoji': name,
        src: emojiUrl(name),
        alt: `:${name}:`,
        title: `:${name}:`,
        draggable: 'false',
      },
    ];
  },

  renderText({ node }) {
    return `:${node.attrs.name}:`;
  },

  addCommands() {
    return {
      insertCustomEmoji:
        (name: string) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs: { name } }]),
    };
  },
});
