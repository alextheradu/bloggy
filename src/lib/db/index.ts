import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { DATABASE_URL } from 'astro:env/server';
import * as schema from './schema';

// Reuse one pool across Vite HMR reloads in dev.
const g = globalThis as unknown as { __blogSql?: ReturnType<typeof postgres> };
const sql = (g.__blogSql ??= postgres(DATABASE_URL, { max: 10 }));

export const db = drizzle(sql, { schema });
export { schema };
