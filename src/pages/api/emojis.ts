import type { APIRoute } from 'astro';
import { getCustomEmojis } from '../../lib/emoji/cachet';
import { jsonBlob } from '../../lib/http';

// GET /blog/api/emojis — compact custom emoji list: [{ n: name, a?: aliasOf }]
// The full ~15 MB Cachet payload never leaves the server.
export const GET: APIRoute = async ({ request }) => {
  try {
    const s = await getCustomEmojis();
    return jsonBlob(
      request,
      { json: s.compactJson, gz: s.compactGz, etag: s.etag },
      'public, max-age=21600, stale-while-revalidate=604800',
    );
  } catch (err) {
    console.error('[api/emojis]', err);
    return Response.json([], { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
};
