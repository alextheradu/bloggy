import type { APIRoute } from 'astro';
import { deletePost, getPostById, isValidSlug, slugify, updatePost, type PostPatch } from '../../../../lib/posts';
import { isDoc } from '../../../../lib/render';
import { bad, readJson } from '../../../../lib/http';
import { u } from '../../../../lib/url';

const STATUSES = new Set(['draft', 'published', 'unlisted']);

export const GET: APIRoute = async ({ params }) => {
  const post = await getPostById(Number(params.id));
  return post ? Response.json(post) : bad('not found', 404);
};

// PUT: partial update. Content arrives as TipTap JSON; HTML is rendered server side.
export const PUT: APIRoute = async ({ params, request }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return bad('bad id');
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return bad('bad json');

  const patch: PostPatch = {};
  if (typeof body.title === 'string') patch.title = body.title.trim();
  if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt.trim();
  if (typeof body.slug === 'string') {
    const s = slugify(body.slug);
    if (!isValidSlug(s) && s !== 'untitled') return bad('invalid slug');
    patch.slug = s;
  }
  if (body.contentJson !== undefined) {
    if (!isDoc(body.contentJson)) return bad('content must be a tiptap doc');
    if (JSON.stringify(body.contentJson).length > 2_000_000) return bad('content too large', 413);
    patch.contentJson = body.contentJson;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) return bad('bad status');
    patch.status = body.status as PostPatch['status'];
  }

  const post = await updatePost(id, patch);
  if (!post) return bad('not found', 404);
  return Response.json({
    id: post.id,
    slug: post.slug,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    url: u(`/${post.slug}`),
  });
};

export const DELETE: APIRoute = async ({ params }) => {
  const ok = await deletePost(Number(params.id));
  return ok ? Response.json({ ok: true }) : bad('not found', 404);
};
