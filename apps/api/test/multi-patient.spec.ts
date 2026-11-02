import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
  acceptNotice,
  createSeedPool,
  loadFixtureAffiliates,
  requestAndReadCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';

// F011 (contracts/F011.md): un navegador con varios pacientes. Criterios de API: 1.5, 5.1, 5.2 y 5.7.
// Los criterios 1.1 y 5.6 ya están en channel-session.spec.ts e identity-verification.spec.ts. app.test_clock es global:
// este archivo corre en serie y deja el reloj en 0.

let app: NestExpressApplication;
let pool: Pool;
let accepted: Accepted;
let sends: ReturnType<typeof trackSends>;

const TEMP_CEDULA = '1000000004';

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
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
});

const setCookies = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] as string[] | undefined) ?? [];
const tokenOf = (cookie: string) => decodeURIComponent(cookie.split(';')[0].split('=')[1]);
const expiresOf = (cookie: string) => Date.parse(cookie.split(';').map((p) => p.trim()).find((a) => /^expires=/i.test(a))!.slice(8));
const sec = (ms: number) => Math.floor(ms / 1000);

async function link(cedula: string, device: string | null = null) {
  await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
  const { challengeId, code } = await requestAndReadCode(app, pool, accepted.cookie, cedula);
  await sends.flush();
  const res = await verifyCode(app, accepted.cookie, { challengeId, code }, { device });
  expect(res.status).toBe(200);
  const cookie = setCookies(res).find((c) => c.startsWith('__Host-pe_device='))!;
  return { res, cookie, token: tokenOf(cookie), expires: expiresOf(cookie) };
}
const me = (token: string) => request(app.getHttpServer()).get('/api/v1/me').set('Cookie', `__Host-pe_device=${token}`);

/** Desfase que deja el reloj en el mediodía de `date` (America/Bogota). Solo hacia adelante. */
async function setClockToBogotaNoon(date: string) {
  const { rows } = await pool.query(
    `SELECT floor(EXTRACT(EPOCH FROM (($1::date + time '12:00') AT TIME ZONE 'America/Bogota' - now())))::int AS offset`,
    [date],
  );
  expect(rows[0].offset).toBeGreaterThan(0);
  await setClockOffset(pool, rows[0].offset);
}

const bindingRows = async () =>
  (
    await pool.query(
      `SELECT b.id, b.created_at, b.expires_at, b.revoked_at, sa.full_name
       FROM app.channel_bindings b JOIN app.patient_refs p ON p.id = b.patient_ref_id JOIN sim.affiliates sa ON sa.id = p.sim_affiliate_id ORDER BY b.created_at`,
    )
  ).rows;

/** Reloj de la aplicación a `seconds` segundos de `expires_at` de la vinculación de `name`; mide que la medición dure menos de 5 s. */
async function clockNear(name: string, seconds: number) {
  const { rows } = await pool.query(
    `SELECT (CASE WHEN $2::int < 0 THEN floor(EXTRACT(EPOCH FROM (b.expires_at - now()))) ELSE ceil(EXTRACT(EPOCH FROM (b.expires_at - now()))) END)::int + $2::int AS offset
     FROM app.channel_bindings b JOIN app.patient_refs p ON p.id = b.patient_ref_id JOIN sim.affiliates sa ON sa.id = p.sim_affiliate_id WHERE sa.full_name = $1 AND b.revoked_at IS NULL`,
    [name, seconds],
  );
  await setClockOffset(pool, rows[0].offset);
}

/** A (2026-12-01) y B (2027-02-01) en el mismo navegador, como en el recorrido de F011. */
async function linkAThenB() {
  await setClockToBogotaNoon('2026-12-01');
  const a = await link(AFFILIATED);
  await setClockToBogotaNoon('2027-02-01');
  const b = await link(AFFILIATED_NO_EMAIL, a.token);
  return { a, b };
}

describe('1.5: sin límite de pacientes por navegador', () => {
  const affiliates = JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8')) as unknown[];

  // Primero las filas que referencian al afiliado (patient_refs lo referencia) y solo después el afiliado.
  const cleanTemp = async () => {
    await resetIdentityData(pool);
    await pool.query('DELETE FROM sim.affiliates WHERE cedula = $1', [TEMP_CEDULA]);
  };
  afterEach(cleanTemp);

  it('tres pacientes en el mismo navegador: GET /me devuelve 3 vinculaciones y la semilla queda intacta', async () => {
    await pool.query(
      `INSERT INTO sim.affiliates (cedula, full_name, eps, affiliation_status, mobile_phone, email)
       VALUES ($1, 'Paciente Ficticio Cuatro', 'sanitas', 'active', '3000000004', 'paciente4@example.invalid')`,
      [TEMP_CEDULA],
    );
    const first = await link(AFFILIATED);
    await link(AFFILIATED_NO_EMAIL, first.token);
    await link(TEMP_CEDULA, first.token);
    const res = await me(first.token);
    expect(res.status).toBe(200);
    expect(res.body.bindings.map((b: { displayName: string }) => b.displayName)).toEqual([
      'Paciente Ficticio Uno',
      'Paciente Ficticio Dos',
      'Paciente Ficticio Cuatro',
    ]);
    expect((await pool.query('SELECT count(*)::int AS n FROM app.browser_devices')).rows[0].n).toBe(1);

    await cleanTemp();
    expect((await pool.query('SELECT count(*)::int AS n FROM sim.affiliates')).rows[0].n).toBe(affiliates.length);
    expect(affiliates).toHaveLength(3);
    for (const table of ['consent_records', 'channel_bindings', 'patient_refs']) {
      expect((await pool.query(`SELECT count(*)::int AS n FROM app.${table}`)).rows[0].n).toBe(0);
    }
  });

  it('el código de verificación no limita la cantidad de vinculaciones por navegador', () => {
    const dir = path.resolve(__dirname, '../src/modules/identity');
    const source = execFileSync('grep', ['-rn', '-i', '-E', 'channel_bindings|channelBindings|LIMIT', dir], { encoding: 'utf8' });
    const lines = source.split('\n').filter((l) => /LIMIT/.test(l) && /binding/i.test(l));
    expect(lines).toEqual([]);
    expect(source).not.toMatch(/count\(\*\)[^\n]*channel_bindings[^\n]*browser_device_id/i);
  });
});

describe('vencimiento de A con B vigente, recorrido de dos verificaciones (criterios 5.1, 5.2 y 5.7)', () => {
  it('5.1: 5 s antes del vencimiento de A hay 2 vinculaciones; 1 s después, solo B, y la fila de A no se modifica', async () => {
    const { a } = await linkAThenB();
    const rows = await bindingRows();
    expect(rows.map((r) => r.full_name)).toEqual(['Paciente Ficticio Uno', 'Paciente Ficticio Dos']);

    const started = Date.now();
    await clockNear('Paciente Ficticio Uno', -5);
    const before = await me(a.token);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(before.status).toBe(200);
    expect(before.body.bindings.map((b: { displayName: string }) => b.displayName)).toEqual(['Paciente Ficticio Uno', 'Paciente Ficticio Dos']);

    await clockNear('Paciente Ficticio Uno', 1);
    const after = await me(a.token);
    expect(after.status).toBe(200);
    expect(after.body.bindings.map((b: { displayName: string }) => b.displayName)).toEqual(['Paciente Ficticio Dos']);
    expect(JSON.stringify(after.body)).not.toContain('Paciente Ficticio Uno');
    const aRow = (await bindingRows())[0];
    expect(aRow.revoked_at).toBeNull();
    expect(aRow.id).toBe(rows[0].id);
    expect(aRow.expires_at).toEqual(rows[0].expires_at);
  });

  it('5.2: la cookie de B tiene el Expires de B y sigue valiendo cuando A vence', async () => {
    const { a, b } = await linkAThenB();
    const rows = await bindingRows();
    expect(b.token).toBe(a.token);
    expect(sec(b.expires)).toBe(sec(rows[1].expires_at.getTime()));
    expect(b.expires).toBeGreaterThan(a.expires);
    await clockNear('Paciente Ficticio Uno', 1);
    const res = await me(a.token);
    expect(res.status).toBe(200);
    expect(res.body.bindings.map((x: { displayName: string }) => x.displayName)).toEqual(['Paciente Ficticio Dos']);
  });

  it('5.7: los vencimientos son meses de calendario (1 de marzo y 1 de mayo de 2027), no 90 días', async () => {
    await linkAThenB();
    const { rows } = await pool.query(
      `SELECT sa.full_name,
              to_char(b.expires_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS day,
              b.expires_at = b.created_at + interval '3 months' AS calendar_months,
              b.expires_at = b.created_at + interval '90 days' AS ninety_days
       FROM app.channel_bindings b JOIN app.patient_refs p ON p.id = b.patient_ref_id JOIN sim.affiliates sa ON sa.id = p.sim_affiliate_id ORDER BY b.created_at`,
    );
    expect(rows.map((r) => [r.full_name, r.day, r.calendar_months])).toEqual([
      ['Paciente Ficticio Uno', '2027-03-01', true],
      ['Paciente Ficticio Dos', '2027-05-01', true],
    ]);
    expect(rows[1].ninety_days).toBe(false);
  });
});
