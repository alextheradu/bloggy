import type { APIRoute } from 'astro';
import { listPublished } from '../../lib/posts';
import { u } from '../../lib/url';

// GET /blog/api/search — published posts for the cmd+k palette (searched client side).
export const GET: APIRoute = async () => {
  const posts = await listPublished();
  return Response.json(
    posts.map((p) => ({ t: p.title, e: p.excerpt, h: u(`/${p.slug}`), d: p.publishedAt?.toISOString() ?? null })),
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' } },
  );
};
