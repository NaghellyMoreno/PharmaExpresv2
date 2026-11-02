import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createTestApp } from './support/app';
import { validateAgainstSchema } from './support/contract';
import {
  AFFILIATED,
  ORIGIN,
  acceptNotice,
  createSeedPool,
  differentCode,
  loadFixtureAffiliates,
  requestAndReadCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';
import { rowDiff, rowMap } from './support/telegram';

// F005, pasos 1 a 4 (vencimiento, bloqueo por intentos, caminos de salida, sin cambio de datos): contracts/F005.md.
// PostgreSQL real; mensajes en modo capture. Las cadenas están escritas aquí a propósito.

const EXIT_PATHS = [
  { kind: 'request_new_code', label: 'Pedir un código nuevo' },
  { kind: 'update_data_at_eps', label: 'Actualizar mis datos en la EPS' },
  { kind: 'in_person_service', label: 'Acudir a la atención presencial' },
];
const PROTECTED_TABLES = ['app.patient_refs', 'app.consent_records', 'app.browser_devices', 'app.channel_bindings'];

let app: NestExpressApplication;
let pool: Pool;
let accepted: Accepted;
let sends: ReturnType<typeof trackSends>;

beforeAll(async () => {
  app = await createTestApp();
  sends = trackSends(app);
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
});
afterAll(async () => {
  await setClockOffset(pool, 0);
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await resetIdentityData(pool);
  accepted = await acceptNotice(app, 'third_party');
});
// T.7: toda prueba que mueve app.test_clock lo restablece a 0 y borra los retos que creó.
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
  await resetIdentityData(pool);
});

/** Pide un código y lo lee del SMS capturado. */
async function begin(cedula = AFFILIATED) {
  await pool.query('TRUNCATE app.captured_messages');
  const r = await requestAndReadCode(app, pool, accepted.cookie, cedula);
  await sends.flush();
  return r;
}
const attemptsOf = async (challengeId: string) =>
  Number((await pool.query('SELECT attempts_used FROM app.otp_challenges WHERE id = $1', [challengeId])).rows[0].attempts_used);
const challengeRow = async (challengeId: string) => (await pool.query('SELECT * FROM app.otp_challenges WHERE id = $1', [challengeId])).rows[0];
const setCookies = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] as string[] | undefined) ?? [];
const deviceCookie = (res: { headers: Record<string, unknown> }) => setCookies(res).filter((c) => c.startsWith('__Host-pe_device='));
const noProtectedRows = (before: Record<string, number>, after: Record<string, number>) =>
  Object.keys(rowDiff(before, after)).filter((t) => PROTECTED_TABLES.includes(t));

describe('paso 1: código vencido a los 10 minutos, aunque sea correcto', () => {
  it('1.1 con el reloj en 601 el código real responde 410 code_expired y no crea nada', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 601);
    const before = await rowMap(pool);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(410);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('code_expired');
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(noProtectedRows(before, await rowMap(pool))).toEqual([]);
    expect(deviceCookie(res)).toEqual([]);
    expect((await challengeRow(challengeId)).consumed_at).toBeNull();
  });

  it('1.2 borde: a 590 s se acepta y a 600 s ya venció', async () => {
    const first = await begin();
    await setClockOffset(pool, 590);
    expect((await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code })).status).toBe(200);
    // Regla del reloj (iii): se borran los retos y el reloj vuelve a 0 entre los dos retos.
    await resetIdentityData(pool);
    await setClockOffset(pool, 0);
    const second = await begin();
    await setClockOffset(pool, 600);
    const late = await verifyCode(app, accepted.cookie, { challengeId: second.challengeId, code: second.code });
    expect(late.status).toBe(410);
    expect(late.body.code).toBe('code_expired');
  });

  it('1.3 un código vencido no suma intento, sea el real o uno incorrecto', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 601);
    for (const sent of [code, differentCode(code)]) {
      const res = await verifyCode(app, accepted.cookie, { challengeId, code: sent });
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('code_expired');
    }
    expect(await attemptsOf(challengeId)).toBe(0);
  });

  it('1.4 la respuesta cumple el esquema Problem y no contiene cédula, celular, correo ni código', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 601);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(validateAgainstSchema('Problem', res.body)).toEqual([]);
    const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
    const affiliates = JSON.parse(readFileSync(resolve(__dirname, '../../../data/simulated/affiliates.json'), 'utf8')) as Array<{
      cedula: string;
      mobilePhone: string;
      email: string | null;
    }>;
    const a = affiliates.find((x) => x.cedula === AFFILIATED)!;
    for (const secret of [AFFILIATED, a.mobilePhone, a.email, code, challengeId]) if (secret) expect(text).not.toContain(secret);
  });

  it('1.6 precedencia: con 3 intentos usados y el reloj en 601 gana el vencimiento y los intentos no cambian', async () => {
    const { challengeId, code } = await begin();
    for (let i = 0; i < 3; i++) expect((await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) })).status).toBe(422);
    expect(await attemptsOf(challengeId)).toBe(3);
    await setClockOffset(pool, 601);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('code_expired');
    expect(res.body.nextSteps).toEqual(EXIT_PATHS);
    expect(await attemptsOf(challengeId)).toBe(3);
  });

  it('3.1 (vencido) nextSteps trae exactamente los tres caminos, en orden y con las etiquetas del anexo', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 601);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.body.nextSteps).toEqual(EXIT_PATHS);
  });
});

describe('paso 2: tres intentos erróneos y luego el correcto, rechazado', () => {
  it('2.1 tres códigos incorrectos responden 422 con 2, 1 y 0 intentos restantes', async () => {
    const { challengeId, code } = await begin();
    for (const remaining of [2, 1, 0]) {
      const res = await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('code_incorrect');
      expect(res.body.attemptsRemaining).toBe(remaining);
      expect(await attemptsOf(challengeId)).toBe(3 - remaining);
    }
  });

  it('2.2, 3.1 y 3.2 el cuarto envío con el código correcto responde 410 code_attempts_exhausted y no crea nada', async () => {
    const { challengeId, code } = await begin();
    const wrong = await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    expect(wrong.body.nextSteps).toBeUndefined(); // 3.2: el 422 no trae caminos de salida
    for (let i = 0; i < 2; i++) await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    const before = await rowMap(pool);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(410);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('code_attempts_exhausted');
    expect(res.body.nextSteps).toEqual(EXIT_PATHS);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(deviceCookie(res)).toEqual([]);
    expect((await challengeRow(challengeId)).consumed_at).toBeNull();
    expect(await attemptsOf(challengeId)).toBe(3);
  });

  it('2.3 un quinto envío incorrecto también responde 410 y los intentos siguen en 3', async () => {
    const { challengeId, code } = await begin();
    for (let i = 0; i < 4; i++) await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    const res = await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(differentCode(code)) });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('code_attempts_exhausted');
    expect(await attemptsOf(challengeId)).toBe(3);
  });

  it('2.4 con dos errores y luego el código correcto la respuesta es 200', async () => {
    const { challengeId, code } = await begin();
    for (let i = 0; i < 2; i++) await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    expect((await verifyCode(app, accepted.cookie, { challengeId, code })).status).toBe(200);
  });

  it('2.5 concurrencia: 5 envíos incorrectos simultáneos dan 3 respuestas 422 y 2 410, en 10 vueltas', async () => {
    for (let round = 0; round < 10; round++) {
      // Regla del reloj (ii): reto nuevo y reloj en 0 al comienzo de cada vuelta.
      await resetIdentityData(pool);
      await setClockOffset(pool, 0);
      const { challengeId, code } = await begin();
      const wrongs = [1, 2, 3, 4, 5].map((n) => String((Number(code) + n) % 1_000_000).padStart(6, '0'));
      const results = await Promise.all(wrongs.map((w) => verifyCode(app, accepted.cookie, { challengeId, code: w })));
      expect(results.map((r) => r.status).sort(), `vuelta ${round}`).toEqual([410, 410, 422, 422, 422]);
      expect(results.filter((r) => r.status === 410).every((r) => r.body.code === 'code_attempts_exhausted')).toBe(true);
      expect(await attemptsOf(challengeId)).toBe(3);
    }
  });

  it('2.6 la respuesta de agotado cumple el esquema Problem y no contiene datos personales ni el código', async () => {
    const { challengeId, code } = await begin();
    for (let i = 0; i < 3; i++) await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(validateAgainstSchema('Problem', res.body)).toEqual([]);
    const text = JSON.stringify(res.body);
    for (const secret of [AFFILIATED, code, challengeId]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/\d{6,}/);
  });
});

describe('paso 3: caminos de salida y encabezados', () => {
  it('3.2 el 410 code_superseded no trae nextSteps', async () => {
    const first = await begin();
    await setClockOffset(pool, 120);
    await begin();
    const res = await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('code_superseded');
    expect(res.body.nextSteps).toBeUndefined();
  });

  it('T.3 los 410 llevan application/problem+json, nosniff y Content-Security-Policy', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 601);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
  });
});

describe('paso 4: la API no ofrece cambiar el celular ni el correo', () => {
  const CONTACT = /contact|phone|email|celular|correo/i;

  it('4.4 ni el contrato ni las rutas reales tienen operaciones de datos de contacto', () => {
    const doc = parse(readFileSync(resolve(__dirname, '../../../api/openapi.yaml'), 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const offending: string[] = [];
    for (const [path, ops] of Object.entries(doc.paths)) {
      if (CONTACT.test(path)) offending.push(path);
      for (const op of Object.values(ops)) if (op && typeof op === 'object' && CONTACT.test(op.operationId ?? '')) offending.push(op.operationId!);
    }
    expect(offending).toEqual([]);
    const real: string[] = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        if (!metatype) continue;
        const prefix = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
        for (const name of Object.getOwnPropertyNames(metatype.prototype)) {
          const handler = metatype.prototype[name];
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          real.push(`${prefix}/${String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')}`);
        }
      }
    }
    expect(real.length).toBeGreaterThan(5); // control positivo: la lista no está vacía
    expect(real.filter((r) => CONTACT.test(r))).toEqual([]);
  });

  it('4.4 POST, PUT y PATCH a rutas de contacto responden 404 y no cambian sim.affiliates', async () => {
    const snapshot = async () => JSON.stringify((await pool.query('SELECT * FROM sim.affiliates ORDER BY cedula')).rows);
    const before = await snapshot();
    for (const path of ['/api/v1/identity/contact', '/api/v1/me/contact', '/api/v1/identity/phone']) {
      for (const method of ['post', 'put', 'patch'] as const) {
        const res = await request(app.getHttpServer())[method](path).set('Cookie', accepted.cookie).set('Origin', ORIGIN()).send({ mobilePhone: '3000000000', email: 'x@example.com' });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    }
    expect(await snapshot()).toBe(before);
  });
});
