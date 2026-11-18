import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type { Extensions } from '@tiptap/core';
import { CustomEmoji } from './emoji-node';

/**
 * Schema shared by the editor (browser) and the server renderer, so the HTML
 * stored on save is byte-for-byte what the editor shows.
 */
export const baseExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer', target: null },
    },
  }),
  Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
  CustomEmoji,
];
