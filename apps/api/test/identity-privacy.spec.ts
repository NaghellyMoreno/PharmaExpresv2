import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_SENDER, SMS_SENDER } from '../src/modules/notifications/messaging';
import { createTestApp } from './support/app';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  UNKNOWN,
  acceptNotice,
  createSeedPool,
  differentCode,
  loadFixtureAffiliates,
  requestAndReadCode,
  requestCode,
  resetIdentityData,
  verifyCode,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';

// F003, invariante 8: ni los registros (R.1) ni las tablas de `app` (R.2) guardan cédulas, códigos, celulares ni correos.

const lines: string[] = [];
const sink: LoggerService = {
  log: (m) => lines.push(String(m)),
  error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
  warn: (m) => lines.push(String(m)),
  debug: (m) => lines.push(String(m)),
  verbose: (m) => lines.push(String(m)),
};

// Marcas de tiempo y registro de arranque de Nest: se retiran con expresiones, no con una lista de líneas.
const NEST_PREFIX = /^\S*\[Nest\]\s+\d+\s+-\s+\d{2}\/\d{2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+/;
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
const stripNoise = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, '').replace(NEST_PREFIX, '').replace(ISO_TIMESTAMP, '');
const DETECTOR = /\b\d{6,12}\b/;
const detects = (line: string) => DETECTOR.test(stripNoise(line));

let app: NestExpressApplication;
let failApp: NestExpressApplication;
let pool: Pool;
let accepted: Accepted;
let sends: ReturnType<typeof trackSends>;
let failSends: ReturnType<typeof trackSends>;

beforeAll(async () => {
  app = await createTestApp({ logger: sink });
  sends = trackSends(app);
  const failing = { send: () => Promise.reject(new Error('falla simulada')) };
  failApp = await createTestApp({ logger: sink, overrides: [[SMS_SENDER, failing], [EMAIL_SENDER, failing]] });
  failSends = trackSends(failApp);
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
});
afterAll(async () => {
  await app.close();
  await failApp.close();
  await pool.end();
});
beforeEach(async () => {
  await resetIdentityData(pool);
  accepted = await acceptNotice(app);
});
afterEach(async () => {
  await sends.flush();
  await failSends.flush();
});

describe('R.1: registros de la API', () => {
  it('el detector marca una línea sintética con cédula y código (control positivo) y no marca las marcas de tiempo', () => {
    expect(detects('usuario 1000000001 codigo 204871')).toBe(true);
    expect(detects('[Nest] 17637  - 11/02/2026, 10:48:17 AM   ERROR [X] sin datos')).toBe(false);
    expect(detects('2026-11-02T10:48:17.123Z sin datos')).toBe(false);
  });

  it('el recorrido completo no deja cédulas, códigos, contactos, challengeId ni tokens en los registros', async () => {
    lines.length = 0;
    const out: string[] = [];
    const spies = [process.stdout, process.stderr].map((s) =>
      vi.spyOn(s, 'write').mockImplementation(((chunk: unknown) => {
        out.push(String(chunk));
        return true;
      }) as never),
    );
    const secrets: string[] = [];
    try {
      // Pedido, mensajes, verificación correcta, código incorrecto, reuso, cédula inexistente y errores.
      const ok = await requestAndReadCode(app, pool, accepted.cookie, AFFILIATED);
      await sends.flush();
      const wrong = await verifyCode(app, accepted.cookie, { challengeId: ok.challengeId, code: differentCode(ok.code) });
      const good = await verifyCode(app, accepted.cookie, { challengeId: ok.challengeId, code: ok.code });
      await verifyCode(app, accepted.cookie, { challengeId: ok.challengeId, code: ok.code });
      const unknown = await requestCode(app, accepted.cookie, UNKNOWN);
      await verifyCode(app, accepted.cookie, { challengeId: unknown.body.challengeId, code: '000000' });
      await requestCode(app, accepted.cookie, 'abc');
      await requestCode(app, null, AFFILIATED);
      await requestCode(app, accepted.cookie, { cedula: AFFILIATED, x: 1 });
      await verifyCode(app, accepted.cookie, { challengeId: 'no-uuid', code: '123456' });
      await requestCode(app, accepted.cookie, AFFILIATED_NO_EMAIL);
      await sends.flush();
      // R.3: fallos de los adaptadores.
      const failCookie = (await acceptNotice(failApp)).cookie;
      await requestCode(failApp, failCookie, AFFILIATED);
      await failSends.flush();
      const device = (good.headers['set-cookie'] as unknown as string[])[0].split(';')[0].split('=')[1];
      secrets.push(ok.code, ok.challengeId, unknown.body.challengeId, device, good.body.csrfToken);
      expect(wrong.status).toBe(422);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const all = [...lines, ...out].flatMap((chunk) => chunk.split('\n')).filter((l) => l.trim() !== '');
    expect(all.filter(detects)).toEqual([]);
    const text = all.join('\n');
    for (const literal of [AFFILIATED, UNKNOWN, '3000000001', 'paciente1@example.invalid', ...secrets.filter(Boolean)]) {
      expect(text).not.toContain(literal);
    }
  });
});

describe('R.2: tablas de app', () => {
  it('la cédula, el código, el celular y el correo en claro no están en ninguna columna de texto de app (con control positivo)', async () => {
    const a = await requestAndReadCode(app, pool, accepted.cookie, AFFILIATED);
    await sends.flush();
    await requestCode(app, accepted.cookie, UNKNOWN);
    expect((await verifyCode(app, accepted.cookie, { challengeId: a.challengeId, code: a.code })).status).toBe(200);
    const needles = [AFFILIATED, UNKNOWN, a.code, '3000000001', 'paciente1@example.invalid'];

    const columns = await pool.query<{ table_schema: string; table_name: string; column_name: string }>(
      `SELECT table_schema, table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name <> 'captured_messages'
         AND (data_type IN ('text', 'character varying', 'jsonb', 'json'))`,
    );
    expect(columns.rowCount).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const { table_schema, table_name, column_name } of columns.rows) {
      const { rows } = await pool.query<{ v: string }>(`SELECT "${column_name}"::text AS v FROM "${table_schema}"."${table_name}" WHERE "${column_name}" IS NOT NULL`);
      for (const { v } of rows) for (const n of needles) if (v.includes(n)) hits.push(`${table_name}.${column_name}`);
    }
    expect(hits).toEqual([]);

    // Control positivo: la misma búsqueda encuentra la cédula en sim.affiliates.
    const sim = await pool.query<{ v: string }>('SELECT cedula AS v FROM sim.affiliates');
    expect(sim.rows.some((r) => needles.some((n) => r.v.includes(n)))).toBe(true);
  });
});
