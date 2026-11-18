import { hasCustomEmoji, isValidEmojiName } from './cachet';
import { isUnicodeEmoji, shortcodeForUnicode } from './unicode';

/**
 * Canonical reaction/emoji key:
 *   custom  -> ":name:"
 *   unicode -> the literal character sequence
 */
export async function isValidEmojiKey(key: string): Promise<boolean> {
  if (key.length > 110) return false;
  const m = /^:(.+):$/.exec(key);
  if (m) return isValidEmojiName(m[1]) && (await hasCustomEmoji(m[1]));
  return isUnicodeEmoji(key);
}

export function emojiLabel(key: string): string {
  const m = /^:(.+):$/.exec(key);
  if (m) return key;
  const sc = shortcodeForUnicode(key);
  return sc ? `:${sc}:` : key;
}
