import type { Editor } from '@tiptap/core';
import {
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  ImageIcon,
  Link2,
  Smile,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { EmojiItem } from '@/lib/emoji/client';
import { EmojiGlyph } from '@/components/react/EmojiGlyph';

export interface SlashItem {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords: string[];
  run: (editor: Editor, ctx: { onImage: () => void; onLink: () => void; onEmoji?: () => void }) => void;
}

const ic = 'size-4';

export const slashItems: SlashItem[] = [
  { id: 'p', label: 'text', hint: 'plain paragraph', icon: <Pilcrow className={ic} />, keywords: ['paragraph', 'text', 'p'], run: (e) => e.chain().focus().setParagraph().run() },
  { id: 'h1', label: 'heading 1', hint: '#', icon: <Heading1 className={ic} />, keywords: ['h1', 'title', 'heading'], run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'heading 2', hint: '##', icon: <Heading2 className={ic} />, keywords: ['h2', 'heading', 'subtitle'], run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'heading 3', hint: '###', icon: <Heading3 className={ic} />, keywords: ['h3', 'heading'], run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: 'ul', label: 'bulleted list', hint: '-', icon: <List className={ic} />, keywords: ['bullet', 'list', 'ul'], run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'ol', label: 'numbered list', hint: '1.', icon: <ListOrdered className={ic} />, keywords: ['numbered', 'ordered', 'list', 'ol'], run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'quote', label: 'quote', hint: '>', icon: <Quote className={ic} />, keywords: ['quote', 'blockquote'], run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'code block', hint: '```', icon: <Code2 className={ic} />, keywords: ['code', 'pre', 'snippet'], run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: 'hr', label: 'divider', hint: '---', icon: <Minus className={ic} />, keywords: ['divider', 'hr', 'line', 'rule'], run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: 'image', label: 'image', hint: 'upload', icon: <ImageIcon className={ic} />, keywords: ['image', 'img', 'photo', 'picture', 'upload'], run: (_e, c) => c.onImage() },
  { id: 'link', label: 'link', hint: '⌘k', icon: <Link2 className={ic} />, keywords: ['link', 'url', 'href'], run: (_e, c) => c.onLink() },
  { id: 'emoji', label: 'emoji', hint: ':', icon: <Smile className={ic} />, keywords: ['emoji', 'reaction'], run: (e) => e.chain().focus().insertContent(':').run() },
];

export const emojiMenuIcon = (e: EmojiItem) => <EmojiGlyph item={e} size={20} />;
