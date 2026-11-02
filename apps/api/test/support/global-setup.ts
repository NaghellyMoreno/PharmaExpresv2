import { Pool } from 'pg';

const url = () => process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';

async function offset(pool: Pool): Promise<number> {
  const { rows } = await pool.query('SELECT offset_seconds FROM app.test_clock');
  return Number(rows[0].offset_seconds);
}

/**
 * Criterio T.7: `app.test_clock` es estado global de la base. Se parte de 0 y, al terminar la suite, el desfase
 * debe ser 0: si una prueba lo dejó movido, la suite falla (y se restablece para no contaminar la siguiente corrida).
 */
export default async function setup() {
  const pool = new Pool({ connectionString: url() });
  await pool.query('UPDATE app.test_clock SET offset_seconds = 0');
  await pool.end();
  return async function teardown() {
    const pool = new Pool({ connectionString: url() });
    try {
      const left = await offset(pool);
      await pool.query('UPDATE app.test_clock SET offset_seconds = 0');
      if (left !== 0) throw new Error(`T.7: al terminar la suite app.test_clock.offset_seconds era ${left}, no 0`);
    } finally {
      await pool.end();
    }
  };
}
