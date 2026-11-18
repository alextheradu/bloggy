import type { AstroCookies } from 'astro';
import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db, schema } from '../db';
import { IS_HTTPS } from '../config';
import { BASE } from '../url';
import type { User } from '../db/schema';

export const SESSION_COOKIE = 'blog_session';
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;

const hashToken = (token: string) => encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

export function generateToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<{ user: User; expiresAt: Date } | null> {
  const id = hashToken(token);
  const rows = await db
    .select({ user: schema.users, session: schema.sessions })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }
  // Sliding renewal: once past half-life, push expiry back out to 30 days.
  let expiresAt = row.session.expiresAt;
  if (expiresAt.getTime() - now < SESSION_TTL / 2) {
    expiresAt = new Date(now + SESSION_TTL);
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, id));
  }
  return { user: row.user, expiresAt };
}

export async function invalidateSession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}

export function setSessionCookie(cookies: AstroCookies, token: string, expiresAt: Date) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_HTTPS,
    sameSite: 'lax',
    path: BASE || '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: BASE || '/' });
}
