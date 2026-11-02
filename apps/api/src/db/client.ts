import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) throw new Error('Falta DATABASE_URL');
  const pool = new Pool({ connectionString, max: 5 });
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export function createDb(pool: Pool) {
  return drizzle(pool);
}
