import type { APIRoute } from 'astro';
import { resolveSlackAvatarUrl } from '../../lib/emoji/cachet';
import { proxyImage } from '../../lib/image-proxy';

// GET /blog/avatar/<slack id>: Hack Club user's Slack avatar via Cachet, proxied.
export const GET: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  if (!/^[A-Z0-9]{5,20}$/.test(id)) return new Response('bad id', { status: 400 });
  return proxyImage({
    key: `avatar/${id}`,
    request,
    cacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
    resolve: () => resolveSlackAvatarUrl(id),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  });
};
