import type { APIRoute } from 'astro';
import { isValidEmojiName, peekCustomEmoji, resolveCustomEmojiUrl } from '../../lib/emoji/cachet';
import { proxyImage } from '../../lib/image-proxy';

// GET /blog/emoji/<name> — Hack Club custom emoji image, served from our domain.
export const GET: APIRoute = async ({ params, request }) => {
  const name = params.name ?? '';
  if (!isValidEmojiName(name)) return new Response('bad name', { status: 400 });
  return proxyImage({
    key: `emoji/${name}`,
    request,
    cacheControl: 'public, max-age=604800, stale-while-revalidate=2592000',
    knownUrl: peekCustomEmoji(name)?.url,
    resolve: () => resolveCustomEmojiUrl(name),
  });
};
