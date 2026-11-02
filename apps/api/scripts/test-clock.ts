// Mueve el reloj de la aplicación solo en pruebas (ADR 0021). Usa el usuario de la semilla; no hay endpoint HTTP.
// Uso: pnpm --filter api test:clock advance <duración> | set <segundos> | reset
// La duración admite segundos o un sufijo s, m, h o d (por ejemplo, 90, 10m, 2h).
import { createPool } from '../src/db/client';

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

function toSeconds(text: string | undefined): number {
  const found = /^(\d+)([smhd]?)$/.exec(text ?? '');
  if (!found) throw new Error('Duración no válida: use un entero con sufijo opcional s, m, h o d');
  return Number(found[1]) * UNITS[found[2] || 's'];
}

async function main() {
  const [command, value] = process.argv.slice(2).filter((a) => a !== '--');
  const pool = createPool(process.env.DATABASE_SEED_URL ?? process.env.DATABASE_URL);
  try {
    let result;
    if (command === 'reset') result = await pool.query('UPDATE app.test_clock SET offset_seconds = 0 RETURNING offset_seconds');
    else if (command === 'set') {
      result = await pool.query('UPDATE app.test_clock SET offset_seconds = $1 RETURNING offset_seconds', [toSeconds(value)]);
    } else if (command === 'advance') {
      result = await pool.query('UPDATE app.test_clock SET offset_seconds = offset_seconds + $1 RETURNING offset_seconds', [toSeconds(value)]);
    } else throw new Error('Uso: test:clock advance <duración> | set <segundos> | reset');
    console.log(`Desfase del reloj: ${result.rows[0].offset_seconds} s.`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
