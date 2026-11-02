// Carga los datos simulados (ADR 0013). Hoy solo los afiliados; las demás entidades llegan con sus funcionalidades.
// Uso: pnpm --filter api db:seed [--file <ruta>]
// Sin --file lee data/simulated/affiliates.local.json (contactos de prueba de la usuaria, no versionado) si existe,
// y si no data/simulated/affiliates.json.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createPool } from '../src/db/client';
import { seedAffiliates } from '../src/seed/affiliates';

const dir = path.resolve(__dirname, '../../../data/simulated');

async function main() {
  const flag = process.argv.indexOf('--file');
  const local = path.join(dir, 'affiliates.local.json');
  const file = flag > -1 ? path.resolve(process.argv[flag + 1] ?? '') : existsSync(local) ? local : path.join(dir, 'affiliates.json');
  const pool = createPool(process.env.DATABASE_SEED_URL ?? process.env.DATABASE_URL);
  try {
    const count = await seedAffiliates(pool, file);
    console.log(`Afiliados simulados cargados: ${count}.`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error('Error al cargar los datos simulados:', e instanceof Error ? e.message : e);
  process.exit(1);
});
