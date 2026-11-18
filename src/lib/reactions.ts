import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';

const { reactions, users } = schema;

export const MAX_DISTINCT_PER_USER = 20;
const NAMES_SHOWN = 5;

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  /** first few reactor names, oldest first */
  names: string[];
}

export async function reactionSummary(postId: number, userId?: number | null): Promise<ReactionSummary[]> {
  const rows = await db
    .select({ emoji: reactions.emoji, userId: reactions.userId, name: users.name, at: reactions.createdAt })
    .from(reactions)
    .innerJoin(users, eq(users.id, reactions.userId))
    .where(eq(reactions.postId, postId))
    .orderBy(asc(reactions.createdAt));

  // Insertion-ordered map keeps pills in "first reacted" order, like Slack.
  const map = new Map<string, ReactionSummary>();
  for (const r of rows) {
    let s = map.get(r.emoji);
    if (!s) map.set(r.emoji, (s = { emoji: r.emoji, count: 0, mine: false, names: [] }));
    s.count++;
    const isMe = userId != null && r.userId === userId;
    if (isMe) {
      s.mine = true;
      s.names.unshift('you'); // viewer always listed first
      if (s.names.length > NAMES_SHOWN) s.names.pop();
    } else if (s.names.length < NAMES_SHOWN) s.names.push(r.name);
  }
  return [...map.values()];
}

export type ToggleResult = { ok: true; added: boolean } | { ok: false; error: 'limit' };

export async function toggleReaction(postId: number, userId: number, emoji: string): Promise<ToggleResult> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(reactions)
      .where(and(eq(reactions.postId, postId), eq(reactions.userId, userId), eq(reactions.emoji, emoji)))
      .returning({ e: reactions.emoji });
    if (removed.length) return { ok: true, added: false } as const;

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(reactions)
      .where(and(eq(reactions.postId, postId), eq(reactions.userId, userId)));
    if (n >= MAX_DISTINCT_PER_USER) return { ok: false, error: 'limit' } as const;

    await tx.insert(reactions).values({ postId, userId, emoji }).onConflictDoNothing();
    return { ok: true, added: true } as const;
  });
}
