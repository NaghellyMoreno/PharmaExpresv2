import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../src/db/client';

async function main() {
  const pool = createPool(process.env.DATABASE_SEED_URL ?? process.env.DATABASE_URL);
  try {
    await migrate(createDb(pool), { migrationsFolder: 'drizzle' });
    console.log('Migraciones aplicadas.');
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error('Error al migrar:', e instanceof Error ? e.message : e);
  process.exit(1);
});
