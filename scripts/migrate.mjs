// Applies pending drizzle migrations. Runs on container start (see Dockerfile)
// and before `npm run dev`. Uses drizzle-orm's migrator so drizzle-kit is not
// needed at runtime.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

// Postgres may still be booting when the container starts; retry briefly.
for (let attempt = 1; ; attempt++) {
  try {
    await sql`select 1`;
    break;
  } catch (err) {
    if (attempt >= 30) throw err;
    console.log(`[migrate] waiting for database (${attempt})...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

await migrate(drizzle(sql), { migrationsFolder });
console.log('[migrate] up to date');
await sql.end();
