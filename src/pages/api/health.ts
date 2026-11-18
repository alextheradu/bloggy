import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../../lib/db';

// Container healthcheck. Cheap: one round trip to Postgres.
export const GET: APIRoute = async () => {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
