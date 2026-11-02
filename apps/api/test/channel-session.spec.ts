import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from './support/app';
import { validateAgainstSchema } from './support/contract';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
  acceptNotice,
  countAllRows,
  createSeedPool,
  loadFixtureAffiliates,
  requestAndReadCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';

// F009 (contracts/F009.md): GET /me, el guard de sesión del navegador y el vencimiento a 3 meses.
// PostgreSQL real; mensajes en modo capture. app.test_clock es global: este archivo corre en serie y deja el reloj en 0.

const lines: string[] = [];
const sink: LoggerService = {
  log: (m) => lines.push(String(m)),
  error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
  warn: (m) => lines.push(String(m)),
  debug: (m) => lines.push(String(m)),
  verbose: (m) => lines.push(String(m)),
};
const written: string[] = [];
const spies: Array<{ mockRestore(): void }> = [];

let app: NestExpressApplication;
let pool: Pool;
let accepted: Accepted;
let sends: ReturnType<typeof trackSends>;
const secrets: string[] = [];

beforeAll(async () => {
  app = await createTestApp({ logger: sink });
  sends = trackSends(app);
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
  for (const s of [process.stdout, process.stderr]) {
    spies.push(vi.spyOn(s, 'write').mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as never));
  }
});
afterAll(async () => {
  spies.forEach((s) => s.mockRestore());
  await setClockOffset(pool, 0);
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await resetIdentityData(pool);
  accepted = await acceptNotice(app, 'third_party');
});
// Criterio T.7: toda prueba que mueve app.test_clock lo restablece, incluso si falla.
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
});

const affiliates = JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8')) as Array<{ cedula: string; mobilePhone: string; email: string | null; eps: string }>;
const uno = affiliates.find((a) => a.cedula === AFFILIATED)!;

const setCookies = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] as string[] | undefined) ?? [];
const deviceCookie = (res: { headers: Record<string, unknown> }) => setCookies(res).find((c) => c.startsWith('__Host-pe_device='));
const tokenOf = (cookie: string) => decodeURIComponent(cookie.split(';')[0].split('=')[1]);
const expiresOf = (cookie: string) => Date.parse(cookie.split(';').map((p) => p.trim()).find((a) => /^expires=/i.test(a))!.slice(8));
const sec = (ms: number) => Math.floor(ms / 1000);
const diff = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => [k, after[k] - before[k]]));

/** Pide y verifica un código de `cedula`; `device` es el token de la cookie del navegador, si ya existe. */
async function link(cedula = AFFILIATED, device: string | null = null) {
  await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
  const { challengeId, code } = await requestAndReadCode(app, pool, accepted.cookie, cedula);
  await sends.flush();
  const res = await verifyCode(app, accepted.cookie, { challengeId, code }, { device });
  expect(res.status).toBe(200);
  const cookie = deviceCookie(res)!;
  secrets.push(tokenOf(cookie), res.body.csrfToken);
  return { res, cookie, token: tokenOf(cookie), expires: expiresOf(cookie) };
}

const me = (token: string | null) => {
  const req = request(app.getHttpServer()).get('/api/v1/me');
  return token === null ? req : req.set('Cookie', `__Host-pe_device=${token}`);
};

/** Desfase entero que deja el reloj de la aplicación `seconds` segundos antes (negativo) o después de `column` de la vinculación. */
async function clockAt(seconds: number, which: 'floor' | 'ceil') {
  const { rows } = await pool.query(
    `SELECT ${which}(EXTRACT(EPOCH FROM (max(expires_at) - now())))::int + $1::int AS offset FROM app.channel_bindings WHERE revoked_at IS NULL`,
    [seconds],
  );
  await setClockOffset(pool, rows[0].offset);
}

/** Desfase que deja el reloj en el mediodía de `date` (America/Bogota). Solo hacia adelante. */
async function setClockToBogotaNoon(date: string) {
  const { rows } = await pool.query(
    `SELECT floor(EXTRACT(EPOCH FROM (($1::date + time '12:00') AT TIME ZONE 'America/Bogota' - now())))::int AS offset`,
    [date],
  );
  expect(rows[0].offset).toBeGreaterThan(0);
  await setClockOffset(pool, rows[0].offset);
}

describe('GET /me con vinculación vigente (criterios 2.1 a 2.3)', () => {
  it('2.1: responde 200 con ChannelSession de la vinculación vigente', async () => {
    const { token } = await link();
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(validateAgainstSchema('ChannelSession', res.body)).toEqual([]);
    expect(res.body.bindings).toHaveLength(1);
    const row = (await pool.query('SELECT patient_ref_id, expires_at FROM app.channel_bindings')).rows[0];
    expect(res.body.bindings[0]).toEqual({
      patientRefId: row.patient_ref_id,
      displayName: 'Paciente Ficticio Uno',
      expiresAt: row.expires_at.toISOString(),
      hasHealthDataAuthorization: false,
    });
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
    expect(res.body.pushEnabled).toBe(false);
  });

  it('2.2: Cache-Control no-store, sin Set-Cookie y sin cédula, contactos, EPS ni token (control: el nombre sí está)', async () => {
    const { token } = await link();
    const res = await me(token);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    const all = `${JSON.stringify(res.headers)}\n${res.text}`;
    expect(all).toContain('Paciente Ficticio Uno');
    for (const value of [uno.cedula, uno.mobilePhone, uno.email!, uno.eps, token]) expect(all).not.toContain(value);
  });

  it('2.3: guarda el hash del csrfToken devuelto, actualiza last_seen_at y no cambia las vinculaciones', async () => {
    const { token } = await link();
    const bindings = () => pool.query('SELECT * FROM app.channel_bindings ORDER BY id');
    const beforeBindings = (await bindings()).rows;
    const seenBefore = (await pool.query('SELECT last_seen_at FROM app.browser_devices')).rows[0].last_seen_at;
    await new Promise((r) => setTimeout(r, 20));
    const first = await me(token);
    const second = await me(token);
    secrets.push(first.body.csrfToken, second.body.csrfToken);
    expect(first.body.csrfToken).not.toBe(second.body.csrfToken);
    const device = (await pool.query('SELECT csrf_hash, last_seen_at FROM app.browser_devices')).rows[0];
    expect(device.csrf_hash).toBe(createHash('sha256').update(second.body.csrfToken).digest('hex'));
    expect(device.csrf_hash).not.toBe(createHash('sha256').update(first.body.csrfToken).digest('hex'));
    expect(device.last_seen_at.getTime()).toBeGreaterThan(seenBefore.getTime());
    expect((await bindings()).rows).toEqual(beforeBindings);
  });
});

describe('GET /me sin sesión (criterio 2.6)', () => {
  const cases: Array<[string, () => request.Test]> = [
    ['sin cookie', () => me(null)],
    ['token aleatorio de 43 caracteres no registrado', () => me('A'.repeat(43))],
    ['cookie vacía', () => request(app.getHttpServer()).get('/api/v1/me').set('Cookie', '__Host-pe_device=')],
    ['cookie de 5000 caracteres', () => me('x'.repeat(5000))],
    ['solo la cookie de consentimiento', () => request(app.getHttpServer()).get('/api/v1/me').set('Cookie', accepted.cookie)],
  ];

  it('en los cinco casos: 401 problem+json idéntico, sin Set-Cookie, sin datos y sin filas nuevas', async () => {
    await link();
    const bodies: Array<{ title: string; status: number; detail?: string }> = [];
    for (const [name, send] of cases) {
      const before = await countAllRows(pool);
      const res = await send();
      expect(res.status, name).toBe(401);
      expect(res.headers['content-type'], name).toMatch(/^application\/problem\+json/);
      expect(res.headers['set-cookie'], name).toBeUndefined();
      expect(res.text, name).not.toContain('Paciente Ficticio');
      expect(diff(before, await countAllRows(pool)), name).toEqual({});
      bodies.push({ title: res.body.title, status: res.body.status, detail: res.body.detail });
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

describe('navegador conocido sin vinculación vigente (criterios 2.7, 2.8 y 3.1 a 3.3)', () => {
  it('2.7: una vinculación revocada responde 200 con bindings vacío', async () => {
    const { token } = await link();
    await pool.query('UPDATE app.channel_bindings SET revoked_at = now()');
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.bindings).toEqual([]);
    expect(res.text).not.toContain('Paciente Ficticio');
  });

  it('2.8: la cookie de otro navegador solo ve su propia vinculación', async () => {
    const a = await link(AFFILIATED);
    const b = await link(AFFILIATED_NO_EMAIL);
    const resA = await me(a.token);
    const resB = await me(b.token);
    expect(resA.body.bindings.map((x: { displayName: string }) => x.displayName)).toEqual(['Paciente Ficticio Uno']);
    expect(resB.body.bindings.map((x: { displayName: string }) => x.displayName)).toEqual(['Paciente Ficticio Dos']);
    expect(resA.body.bindings[0].patientRefId).not.toBe(resB.body.bindings[0].patientRefId);
  });

  it('3.1: con el reloj 5 s antes de expires_at sigue vigente (el margen de 5 s cubre el tiempo real de la petición)', async () => {
    const { token } = await link();
    const start = Date.now();
    await clockAt(-5, 'floor');
    const res = await me(token);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(res.body.bindings).toHaveLength(1);
  });

  it('3.2: con el reloj 1 s después de expires_at responde bindings vacío y la fila no cambia', async () => {
    const { token, cookie } = await link();
    const before = (await pool.query('SELECT * FROM app.channel_bindings')).rows;
    await clockAt(1, 'ceil');
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.bindings).toEqual([]);
    expect(res.text).not.toContain('Paciente Ficticio');
    expect((await pool.query('SELECT * FROM app.channel_bindings')).rows).toEqual(before);
    expect(before[0].revoked_at).toBeNull();
    // 3.7: la cookie conserva su Expires, pero la respuesta no la renueva ni da acceso.
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(sec(expiresOf(cookie))).toBe(sec(before[0].expires_at.getTime()));
  });

  it('3.2: en el instante exacto expires_at no es mayor que el reloj, y un segundo después sí (SQL en una transacción)', async () => {
    await link();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Reloj en el día 15 (sin recorte de fin de mes) para que created_at + 3 meses sea exactamente expires_at.
      await c.query(
        `UPDATE app.test_clock SET offset_seconds = floor(EXTRACT(EPOCH FROM (timestamptz '2027-01-15 12:00+00' - now())))::int`,
      );
      await c.query(
        `UPDATE app.channel_bindings SET created_at = app.clock_now() - interval '3 months', expires_at = app.clock_now()`,
      );
      const exact = await c.query('SELECT (expires_at = app.clock_now()) AS same, (expires_at > app.clock_now()) AS live FROM app.channel_bindings');
      expect(exact.rows[0]).toEqual({ same: true, live: false });
      await c.query(
        `UPDATE app.channel_bindings SET created_at = created_at + interval '1 second', expires_at = expires_at + interval '1 second'`,
      );
      const later = await c.query('SELECT (expires_at > app.clock_now()) AS live FROM app.channel_bindings');
      expect(later.rows[0].live).toBe(true);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it.each([
    ['2026-11-30', '2027-02-28'],
    ['2027-08-31', '2027-11-30'],
  ])('3.3: verificada el %s al mediodía de Bogotá, vence el %s (3 meses de calendario)', async (day, expected) => {
    await setClockToBogotaNoon(day);
    const { token } = await link();
    const row = (await pool.query(
      `SELECT (expires_at = created_at + interval '3 months') AS three,
              to_char(expires_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS day FROM app.channel_bindings`,
    )).rows[0];
    expect(row).toEqual({ three: true, day: expected });
    await clockAt(-5, 'floor');
    expect((await me(token)).body.bindings).toHaveLength(1);
    await clockAt(2, 'ceil');
    expect((await me(token)).body.bindings).toEqual([]);
  });

  it('3.3 (control): la restricción rechaza una vinculación de 90 días', async () => {
    await link();
    await expect(
      pool.query(
        `INSERT INTO app.channel_bindings (patient_ref_id, browser_device_id, created_at, expires_at)
         SELECT patient_ref_id, browser_device_id, now(), now() + interval '90 days' FROM app.channel_bindings`,
      ),
    ).rejects.toThrow(/channel_bindings_three_months/);
  });

  it('3.9: dos pacientes en un navegador vencen cada uno a los 3 meses de la suya', async () => {
    const a = await link(AFFILIATED);
    await setClockOffset(pool, 30 * 86400);
    await link(AFFILIATED_NO_EMAIL, a.token);
    await setClockOffset(pool, 100 * 86400);
    const middle = await me(a.token);
    expect(middle.body.bindings.map((b: { displayName: string }) => b.displayName)).toEqual(['Paciente Ficticio Dos']);
    await setClockOffset(pool, 125 * 86400);
    expect((await me(a.token)).body.bindings).toEqual([]);
  });
});

describe('código nuevo con la vinculación vencida (criterios 4.2 a 4.7)', () => {
  /** Verifica, adelanta el reloj 4 meses y verifica otra vez desde el mismo navegador. */
  async function expireAndRelink() {
    const first = await link();
    await setClockOffset(pool, 4 * 30 * 86400);
    const second = await link(AFFILIATED, first.token);
    return { first, second };
  }

  it('4.2 y 4.4: misma cookie con Expires nuevo y atributos; GET /me muestra la vinculación nueva', async () => {
    const { first, second } = await expireAndRelink();
    expect(second.token).toBe(first.token);
    const attrs = second.cookie.split(';').map((p) => p.trim());
    expect(attrs).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']));
    expect(attrs.some((a) => /^domain=/i.test(a))).toBe(false);
    expect(second.expires).toBeGreaterThan(first.expires);
    const rows = (await pool.query('SELECT expires_at, revoked_at FROM app.channel_bindings ORDER BY created_at')).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1].revoked_at).toBeNull();
    expect(sec(second.expires)).toBe(sec(rows[1].expires_at.getTime()));
    const res = await me(second.token);
    expect(res.body.bindings).toHaveLength(1);
    expect(res.body.bindings[0].expiresAt).toBe(rows[1].expires_at.toISOString());
    expect(Date.parse(res.body.bindings[0].expiresAt)).toBeGreaterThan(rows[0].expires_at.getTime());
    expect(res.body.csrfToken).not.toBe(second.res.body.csrfToken);
  });

  it('4.3 caso 1: reverificar a A con su vinculación vigente trae el Expires de B, la más tardía', async () => {
    const a = await link(AFFILIATED);
    await setClockOffset(pool, 30 * 86400);
    await link(AFFILIATED_NO_EMAIL, a.token);
    const before = (await pool.query('SELECT id, expires_at, revoked_at FROM app.channel_bindings ORDER BY created_at')).rows;
    await setClockOffset(pool, 31 * 86400);
    const third = await link(AFFILIATED, a.token);
    const after = (await pool.query('SELECT id, expires_at, revoked_at FROM app.channel_bindings ORDER BY created_at')).rows;
    expect(after).toEqual(before);
    expect(sec(third.expires)).toBe(sec(before[1].expires_at.getTime()));
    expect(sec(third.expires)).not.toBe(sec(before[0].expires_at.getTime()));
  });

  it('4.3 caso 2: con A vencida y B vigente, reverificar a A trae el Expires de la nueva vinculación de A', async () => {
    const a = await link(AFFILIATED);
    await setClockOffset(pool, 30 * 86400);
    await link(AFFILIATED_NO_EMAIL, a.token);
    const bBefore = (await pool.query('SELECT id, expires_at, revoked_at FROM app.channel_bindings ORDER BY created_at')).rows[1];
    await setClockOffset(pool, 100 * 86400);
    const again = await link(AFFILIATED, a.token);
    const rows = (await pool.query('SELECT id, expires_at, revoked_at FROM app.channel_bindings ORDER BY created_at')).rows;
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(bBefore);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(sec(again.expires)).toBe(sec(rows[2].expires_at.getTime()));
    expect(rows[2].expires_at.getTime()).toBeGreaterThan(bBefore.expires_at.getTime());
  });

  it('4.6: un código incorrecto o vencido no revive la vinculación vencida', async () => {
    const first = await link();
    await setClockOffset(pool, 4 * 30 * 86400);
    await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
    const { challengeId, code } = await requestAndReadCode(app, pool, accepted.cookie);
    await sends.flush();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const before = (await pool.query('SELECT * FROM app.channel_bindings')).rows;
    const bad = await verifyCode(app, accepted.cookie, { challengeId, code: wrong }, { device: first.token });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('code_incorrect');
    expect(setCookies(bad)).toEqual([]);
    expect((await me(first.token)).body.bindings).toEqual([]);
    await setClockOffset(pool, 4 * 30 * 86400 + 11 * 60);
    const late = await verifyCode(app, accepted.cookie, { challengeId, code }, { device: first.token });
    expect(late.status).toBe(410);
    expect(setCookies(late)).toEqual([]);
    expect((await me(first.token)).body.bindings).toEqual([]);
    expect((await pool.query('SELECT * FROM app.channel_bindings')).rows).toEqual(before);
  });

  it('4.7: la nueva verificación registra de nuevo la aceptación de la sesión actual', async () => {
    await expireAndRelink();
    const { rows } = await pool.query("SELECT channel, accepted_at FROM app.consent_records WHERE kind = 'data_processing' ORDER BY recorded_at");
    expect(rows).toHaveLength(2);
    expect(rows[1].channel).toBe('web');
    expect(rows[1].accepted_at.toISOString()).toBe(new Date(accepted.payload.acceptedAt).toISOString());
  });
});

describe('registros de la API durante F009 (criterios R.1 y R.2)', () => {
  const NUMBERS = /\b\d{6,12}\b/;
  const TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/;
  /** Líneas que filtran un número largo, un token de 43 caracteres o alguno de los valores concretos. */
  const leaks = (text: string[], values: string[]) =>
    text.flatMap((l) => l.split('\n')).filter((l) => NUMBERS.test(l) || TOKEN.test(l) || values.some((v) => l.includes(v)));

  it('R.2: el detector marca una cédula y un token de 43 caracteres sembrados (control positivo)', () => {
    expect(leaks(['usuario 1000000001 consulta'], [])).toHaveLength(1);
    expect(leaks([`token ${'a'.repeat(43)}`], [])).toHaveLength(1);
    expect(leaks(['línea limpia con 4f1c9e0a-1234-4abc-8def-0123456789ab'], [])).toHaveLength(0);
  });

  it('R.1: GET /me (200, 401, vacío) y la verificación con vinculación vencida no dejan datos en los registros', async () => {
    const { token } = await link();
    await me(token);
    await me(null);
    await setClockOffset(pool, 4 * 30 * 86400);
    await me(token);
    const again = await link(AFFILIATED, token);
    await me(again.token);
    expect(secrets.length).toBeGreaterThan(2);
    const values = [uno.cedula, uno.mobilePhone, uno.email!, ...secrets];
    expect(leaks([...lines, ...written], values)).toEqual([]);
  });
});
