import type { Pool } from 'pg';

/** Filas por tabla del esquema public (sin la tabla de migraciones). La lista se obtiene al momento. */
export async function countRows(pool: Pool): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%drizzle%migrations%'
     ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of rows) {
    const r = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "public"."${table_name.replace(/"/g, '""')}"`);
    counts[table_name] = Number(r.rows[0].n);
  }
  return counts;
}
