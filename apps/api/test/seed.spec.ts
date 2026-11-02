import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAffiliates } from '../src/seed/affiliates';
import { FIXTURE_AFFILIATES, createSeedPool } from './support/identity';

// Criterio T.6 de F003: la carga de afiliados es repetible y rechaza datos mal formados sin imprimir valores.
const base = { fullName: 'Paciente Ficticio Cuatro', eps: 'sanitas', affiliationStatus: 'active', email: null };
let pool: Pool;
let dir: string;
const write = (name: string, rows: unknown): string => {
  const file = path.join(dir, name);
  writeFileSync(file, typeof rows === 'string' ? rows : JSON.stringify(rows));
  return file;
};
const count = async () => Number((await pool.query('SELECT count(*) AS n FROM sim.affiliates')).rows[0].n);

beforeAll(() => {
  pool = createSeedPool();
  dir = mkdtempSync(path.join(os.tmpdir(), 'pe-seed-'));
});
afterAll(async () => {
  await seedAffiliates(pool, FIXTURE_AFFILIATES);
  await pool.end();
  rmSync(dir, { recursive: true, force: true });
});

describe('db:seed (T.6)', () => {
  it('dos cargas seguidas dejan el mismo número de filas que el archivo, sin duplicar y conservando el id', async () => {
    const expected = (JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8')) as unknown[]).length;
    await seedAffiliates(pool, FIXTURE_AFFILIATES);
    const ids = (await pool.query('SELECT id FROM sim.affiliates ORDER BY cedula')).rows;
    await seedAffiliates(pool, FIXTURE_AFFILIATES);
    expect(await count()).toBe(expected);
    expect((await pool.query('SELECT id FROM sim.affiliates ORDER BY cedula')).rows).toEqual(ids);
  });

  it('el comando pnpm db:seed corre dos veces seguidas con el archivo de prueba', () => {
    const cwd = path.resolve(__dirname, '..');
    for (let i = 0; i < 2; i++) {
      const out = execFileSync('pnpm', ['db:seed', '--', '--file', FIXTURE_AFFILIATES], { cwd, encoding: 'utf8', env: process.env });
      expect(out).toContain('Afiliados simulados cargados: 3.');
    }
  });

  it('retira los afiliados que ya no están en el archivo', async () => {
    await seedAffiliates(pool, write('uno.json', [{ ...base, cedula: '2000000001', mobilePhone: '3000000009' }]));
    expect(await count()).toBe(1);
    await seedAffiliates(pool, FIXTURE_AFFILIATES);
    expect(await count()).toBe(3);
  });

  it.each([
    ['cédula repetida', [{ ...base, cedula: '2000000001', mobilePhone: '3000000009' }, { ...base, cedula: '2000000001', mobilePhone: '3000000008' }], ['2000000001']],
    ['celular con formato inválido', [{ ...base, cedula: '2000000002', mobilePhone: '12345' }], ['2000000002', '12345']],
    ['no es una lista', '{"cedula":"2000000003"}', ['2000000003']],
  ])('rechaza %s con un mensaje que no imprime los valores y sin cambiar la base', async (_name, rows, secrets) => {
    const before = await count();
    const error = await seedAffiliates(pool, write('malo.json', rows)).then(
      () => null,
      (e: Error) => e,
    );
    expect(error).not.toBeNull();
    for (const secret of secrets) expect(error!.message).not.toContain(secret);
    expect(await count()).toBe(before);
  });
});
