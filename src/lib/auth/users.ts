import { sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { ProviderId, ProviderProfile } from './providers';

export async function upsertUser(provider: ProviderId, p: ProviderProfile) {
  const [row] = await db
    .insert(schema.users)
    .values({ provider, ...p })
    .onConflictDoUpdate({
      target: [schema.users.provider, schema.users.providerUserId],
      set: {
        username: p.username,
        name: p.name,
        avatarUrl: p.avatarUrl,
        lastLoginAt: sql`now()`,
      },
    })
    .returning();
  return row;
}
