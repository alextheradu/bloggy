import type { APIRoute } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { reactionSummary, toggleReaction, MAX_DISTINCT_PER_USER } from '../../../lib/reactions';
import { isValidEmojiKey } from '../../../lib/emoji';
import { bad, readJson } from '../../../lib/http';

async function visiblePost(id: number) {
  const rows = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.id, id), inArray(schema.posts.status, ['published', 'unlisted'])))
    .limit(1);
  return rows[0] ?? null;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.postId);
  if (!Number.isInteger(id) || !(await visiblePost(id))) return bad('not found', 404);
  return Response.json(await reactionSummary(id, locals.user?.id), { headers: { 'Cache-Control': 'private, no-store' } });
};

// POST { emoji } toggles the current user's reaction.
export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return bad('login required', 401);
  const id = Number(params.postId);
  if (!Number.isInteger(id) || !(await visiblePost(id))) return bad('not found', 404);

  const body = await readJson<{ emoji?: unknown }>(request);
  const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : '';
  if (!emoji || !(await isValidEmojiKey(emoji))) return bad('unknown emoji');

  const res = await toggleReaction(id, locals.user.id, emoji);
  if (!res.ok) return bad(`max ${MAX_DISTINCT_PER_USER} different reactions per post`, 429);
  return Response.json(await reactionSummary(id, locals.user.id));
};
