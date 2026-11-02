import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/client';

// Contra PostgreSQL real (ADR 0003 y 0017): reloj de la aplicación (ADR 0021).
describe('app.clock_now()', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = createPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('con desfase 0 devuelve la hora de la base de datos', async () => {
    const { rows } = await pool.query<{ diff: number }>(
      'SELECT abs(extract(epoch FROM app.clock_now() - now())) AS diff',
    );
    expect(Number(rows[0].diff)).toBeLessThan(1);
  });

  it('el desfase es 0 y no puede ser negativo', async () => {
    const { rows } = await pool.query('SELECT offset_seconds FROM app.test_clock');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].offset_seconds)).toBe(0);
    await expect(pool.query('UPDATE app.test_clock SET offset_seconds = -1')).rejects.toThrow();
  });
});
