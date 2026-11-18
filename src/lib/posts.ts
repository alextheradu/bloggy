import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db, schema } from './db';
import type { Post, PostStatus } from './db/schema';
import { renderDoc, EMPTY_DOC } from './render';
import { slugify, isValidSlug, RESERVED_SLUGS as RESERVED } from './slug';

const { posts } = schema;

export { slugify, isValidSlug };

/** Make `wanted` unique among posts (ignoring `selfId`), appending -2, -3... */
export async function uniqueSlug(wanted: string, selfId?: number): Promise<string> {
  let base = slugify(wanted);
  if (RESERVED.has(base)) base = `${base}-post`;
  const taken = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(
      and(
        sql`${posts.slug} ~ ${`^${base}(-[0-9]+)?$`}`,
        selfId != null ? ne(posts.id, selfId) : undefined,
      ),
    );
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
}

export type PostSummary = Pick<Post, 'id' | 'slug' | 'title' | 'excerpt' | 'publishedAt' | 'readingMinutes'>;

const summaryCols = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  publishedAt: posts.publishedAt,
  readingMinutes: posts.readingMinutes,
};

/** Public listing: published only (unlisted stays reachable by URL but hidden). */
export async function listPublished(limit?: number): Promise<PostSummary[]> {
  const q = db
    .select(summaryCols)
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.publishedAt), desc(posts.id));
  return limit ? q.limit(limit) : q;
}

export async function listAll() {
  return db
    .select({ ...summaryCols, status: posts.status, updatedAt: posts.updatedAt, createdAt: posts.createdAt })
    .from(posts)
    .orderBy(desc(posts.updatedAt));
}

export async function getPostBySlug(slug: string, opts: { includeDrafts?: boolean } = {}): Promise<Post | null> {
  const statuses: PostStatus[] = opts.includeDrafts ? ['published', 'unlisted', 'draft'] : ['published', 'unlisted'];
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), inArray(posts.status, statuses)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPostById(id: number): Promise<Post | null> {
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createDraft(): Promise<Post> {
  const slug = await uniqueSlug(`untitled-${Date.now().toString(36)}`);
  const [row] = await db.insert(posts).values({ slug, contentJson: EMPTY_DOC }).returning();
  return row;
}

export interface PostPatch {
  title?: string;
  slug?: string;
  excerpt?: string;
  contentJson?: JSONContent;
  status?: PostStatus;
}

export async function updatePost(id: number, patch: PostPatch): Promise<Post | null> {
  const current = await getPostById(id);
  if (!current) return null;
  const set: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() };

  if (patch.title != null) set.title = patch.title.slice(0, 200);
  if (patch.excerpt != null) set.excerpt = patch.excerpt.slice(0, 500);
  if (patch.slug != null && patch.slug !== current.slug) set.slug = await uniqueSlug(patch.slug, id);
  if (patch.contentJson) {
    const r = renderDoc(patch.contentJson);
    set.contentJson = patch.contentJson;
    set.contentHtml = r.html;
    set.contentText = r.text;
    set.readingMinutes = r.readingMinutes;
    set.coverImage = r.coverImage;
  }
  if (patch.status) {
    set.status = patch.status;
    // published_at is set on first publish and then kept.
    if (patch.status !== 'draft' && !current.publishedAt) set.publishedAt = new Date();
  }
  const [row] = await db.update(posts).set(set).where(eq(posts.id, id)).returning();
  return row ?? null;
}

export async function deletePost(id: number): Promise<boolean> {
  const rows = await db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
  return rows.length > 0;
}
