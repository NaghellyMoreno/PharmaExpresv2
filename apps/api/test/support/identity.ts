import { createHmac } from 'node:crypto';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';
import { createPool } from '../../src/db/client';
import { PRIVACY_NOTICE } from '../../src/modules/identity/privacy-notice';
import { seedAffiliates } from '../../src/seed/affiliates';

export const FIXTURE_AFFILIATES = path.resolve(__dirname, '../../../../data/simulated/affiliates.json');
export const ORIGIN = () => process.env.APP_ORIGIN!;

// Datos ficticios del contrato (contracts/F003.md, "Datos de prueba").
export const AFFILIATED = '1000000001';
export const AFFILIATED_NO_EMAIL = '1000000002';
export const AFFILIATED_INACTIVE = '1000000003';
export const UNKNOWN = '1000000999';

/** Mensaje aprobado, escrito aquí a propósito: la prueba no lo toma del código. */
export const APPROVED_MESSAGE =
  'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.';

/** Conexión de la semilla: la que mueve el reloj y limpia datos entre pruebas. */
export function createSeedPool(): Pool {
  return createPool(process.env.DATABASE_SEED_URL ?? process.env.DATABASE_URL);
}

/** Huella calculada en la prueba, sin usar el código de la aplicación. */
export const fingerprintOf = (cedula: string) => createHmac('sha256', process.env.CEDULA_FINGERPRINT_KEY!).update(cedula).digest('hex');

export async function loadFixtureAffiliates(pool: Pool): Promise<void> {
  await seedAffiliates(pool, FIXTURE_AFFILIATES);
}

/** Vacía las tablas de F003 (y nada más) para que cada prueba parta de cero. */
export async function resetIdentityData(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE app.channel_bindings, app.browser_devices, app.patient_refs, app.consent_records, app.otp_challenges, app.captured_messages`,
  );
}

export const setClockOffset = (pool: Pool, seconds: number) => pool.query('UPDATE app.test_clock SET offset_seconds = $1', [seconds]);

/** Filas por tabla de los esquemas `app` y `public` (la lista se obtiene al momento; el reloj queda fuera). */
export async function countAllRows(pool: Pool): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema IN ('app', 'public') AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE '%drizzle%migrations%' AND table_name <> 'test_clock'
     ORDER BY table_schema, table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_schema, table_name } of rows) {
    const r = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "${table_schema}"."${table_name}"`);
    counts[`${table_schema}.${table_name}`] = Number(r.rows[0].n);
  }
  return counts;
}

export interface Accepted {
  /** Valor de la cabecera `Cookie`. */
  cookie: string;
  /** Carga útil decodificada de la cookie (sin comprobar la firma). */
  payload: { noticeVersion: string; declarant: string; channel: string; acceptedAt: string };
}

/** Acepta el aviso por la API real y devuelve la cookie de consentimiento. */
export async function acceptNotice(app: NestExpressApplication, declarant: 'holder' | 'third_party' = 'third_party'): Promise<Accepted> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/consents/acceptance')
    .set('Origin', ORIGIN())
    .send({ noticeVersion: PRIVACY_NOTICE.version, declarant });
  const raw = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  const value = decodeURIComponent(raw.slice(raw.indexOf('=') + 1));
  const payload = JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString('utf8'));
  return { cookie: raw, payload };
}

export const requestCode = (app: NestExpressApplication, cookie: string | null, cedula: unknown, origin: string | null = ORIGIN()) => {
  let req = request(app.getHttpServer()).post('/api/v1/identity/otp-requests');
  if (cookie) req = req.set('Cookie', cookie);
  if (origin) req = req.set('Origin', origin);
  return req.send(typeof cedula === 'object' && cedula !== null ? cedula : { cedula });
};

export const verifyCode = (
  app: NestExpressApplication,
  cookie: string | null,
  body: unknown,
  extra: { origin?: string | null; device?: string | null } = {},
) => {
  let req = request(app.getHttpServer()).post('/api/v1/identity/verifications');
  const cookies = [cookie, extra.device ? `__Host-pe_device=${extra.device}` : null].filter(Boolean).join('; ');
  if (cookies) req = req.set('Cookie', cookies);
  const origin = extra.origin === undefined ? ORIGIN() : extra.origin;
  if (origin) req = req.set('Origin', origin);
  return req.send(body as object);
};

export interface CapturedMessage {
  channel: 'sms' | 'email';
  destination: string;
  subject: string | null;
  body: string;
}

export async function capturedMessages(pool: Pool): Promise<CapturedMessage[]> {
  const { rows } = await pool.query<CapturedMessage>('SELECT channel, destination, subject, body FROM app.captured_messages ORDER BY created_at, channel');
  return rows;
}

/** El envío ocurre después de responder: se sondea hasta `timeoutMs`. */
export async function waitForMessages(pool: Pool, count: number, timeoutMs = 5000): Promise<CapturedMessage[]> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const found = await capturedMessages(pool);
    if (found.length >= count || Date.now() > end) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Extrae el código de 6 dígitos del cuerpo de un mensaje. */
export function codeIn(text: string): string {
  const found = text.match(/\b\d{6}\b/g) ?? [];
  if (found.length !== 1) throw new Error(`Se esperaba exactamente un código y hay ${found.length}`);
  return found[0];
}

/** Pide el código y devuelve el `challengeId` y el código del SMS capturado. */
export async function requestAndReadCode(app: NestExpressApplication, pool: Pool, cookie: string, cedula = AFFILIATED) {
  const res = await requestCode(app, cookie, cedula);
  if (res.status !== 202) throw new Error(`El pedido respondió ${res.status}`);
  const end = Date.now() + 5000;
  let sms: CapturedMessage | undefined;
  while (!sms && Date.now() < end) {
    sms = (await capturedMessages(pool)).find((m) => m.channel === 'sms');
    if (!sms) await new Promise((r) => setTimeout(r, 50));
  }
  if (!sms) throw new Error('No llegó el SMS capturado');
  return { challengeId: res.body.challengeId as string, code: codeIn(sms.body), res };
}

/** Un código de 6 dígitos distinto de `code`, calculado (no una constante). */
export const differentCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
