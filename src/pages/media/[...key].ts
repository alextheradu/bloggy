import type { APIRoute } from 'astro';
import { getObject, objectResponse } from '../../lib/s3';

// GET /blog/media/<key>: streams uploads out of the private bucket.
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^uploads\/[\w./-]+$/.test(key) || key.includes('..')) return new Response('not found', { status: 404 });
  const obj = await getObject(key);
  if (!obj) return new Response('not found', { status: 404 });
  // keys are random + never rewritten, so they can be cached forever
  return objectResponse(obj, request, 'public, max-age=31536000, immutable');
};
