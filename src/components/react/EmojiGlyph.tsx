import { emojiUrl, type EmojiItem } from '@/lib/emoji/client';

/** Renders one emoji: custom via our /blog/emoji proxy (never slack-edge), unicode as text. */
export function EmojiGlyph({ item, size }: { item: EmojiItem; size?: number }) {
  if (item.kind === 'custom') {
    return (
      <img
        className="emoji"
        src={emojiUrl(item.name)}
        alt={`:${item.name}:`}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={size ? { width: size, height: size } : undefined}
      />
    );
  }
  return (
    <span className="glyph" role="img" aria-label={item.codes[0]} style={size ? { fontSize: size * 0.85 } : undefined}>
      {item.char}
    </span>
  );
}
