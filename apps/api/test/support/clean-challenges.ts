import { Pool } from 'pg';
import { afterAll, beforeAll } from 'vitest';

// F005: la espera de 2 minutos y el máximo por hora cuentan retos de `app.otp_challenges`. Para que ningún archivo de pruebas
// dependa de los retos que dejó el anterior (los archivos corren en serie sobre la misma base), cada archivo parte y termina
// sin retos ni mensajes capturados. Es preparación: no cambia ninguna aserción.
async function clean() {
  const pool = new Pool({ connectionString: process.env.DATABASE_SEED_URL ?? process.env.DATABASE_URL });
  try {
    await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
  } finally {
    await pool.end();
  }
}
beforeAll(clean);
afterAll(clean);
