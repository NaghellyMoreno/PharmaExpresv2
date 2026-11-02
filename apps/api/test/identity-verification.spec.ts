import { createHash, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app';
import { validateAgainstSchema } from './support/contract';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  UNKNOWN,
  acceptNotice,
  countAllRows,
  createSeedPool,
  differentCode,
  fingerprintOf,
  loadFixtureAffiliates,
  requestAndReadCode,
  requestCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  waitForMessages,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';

// F003, pasos 4 a 6 y 8 a 9 (verificar el código): contracts/F003.md. PostgreSQL real; mensajes en modo capture.

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
// T.7: toda prueba que mueve app.test_clock lo restablece a 0.
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
});

const diff = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => [k, after[k] - before[k]]));
const ROWS_OF_A_VERIFICATION = { 'app.patient_refs': 1, 'app.browser_devices': 1, 'app.channel_bindings': 1, 'app.consent_records': 1 };

/** Pide el código y lo lee del SMS capturado; los mensajes ya no cuentan en las comparaciones posteriores. */
async function begin(cedula = AFFILIATED, cookie = accepted.cookie) {
  await pool.query('TRUNCATE app.captured_messages');
  const r = await requestAndReadCode(app, pool, cookie, cedula);
  await sends.flush();
  return r;
}

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  return (res.headers['set-cookie'] as string[] | undefined) ?? [];
}
const deviceCookie = (res: { headers: Record<string, unknown> }) => setCookies(res).find((c) => c.startsWith('__Host-pe_device='));
const tokenOf = (cookie: string) => decodeURIComponent(cookie.split(';')[0].split('=')[1]);

describe('verificar el código correcto (criterios 4.2 a 4.5)', () => {
  it('4.2: con el reloj 5 minutos adelante responde 200 con VerificationResult', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 300);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(200);
    expect(validateAgainstSchema('VerificationResult', res.body)).toEqual([]);
    expect(res.body.binding.displayName).toBe('Paciente Ficticio Uno');
    expect(res.body.binding.hasHealthDataAuthorization).toBe(false);
    expect(res.body.binding.patientRefId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(res.body.binding.expiresAt))).toBe(false);
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });

  it('4.3: emite solo __Host-pe_device con HttpOnly, Secure, SameSite=Strict, Path=/, sin Domain y con Expires de la vinculación', async () => {
    const { challengeId, code } = await begin();
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    const attrs = cookies[0].split(';').map((p) => p.trim());
    expect(attrs[0]).toMatch(/^__Host-pe_device=.+/);
    expect(attrs).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']));
    expect(attrs.some((a) => /^domain=/i.test(a))).toBe(false);
    const expires = attrs.find((a) => /^expires=/i.test(a))!.slice('expires='.length);
    const expectedSecond = Math.floor(Date.parse(res.body.binding.expiresAt) / 1000);
    expect(Math.floor(Date.parse(expires) / 1000)).toBe(expectedSecond);
  });

  it('4.4: crea 1 paciente, 1 navegador, 1 vinculación y 1 consentimiento; la vinculación dura 3 meses; el token no se guarda en claro', async () => {
    const { challengeId, code } = await begin();
    const before = await countAllRows(pool);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(200);
    expect(diff(before, await countAllRows(pool))).toEqual(ROWS_OF_A_VERIFICATION);
    const { rows } = await pool.query(
      `SELECT expires_at, (expires_at = created_at + interval '3 months') AS three_months FROM app.channel_bindings`,
    );
    expect(rows[0].three_months).toBe(true);
    expect(res.body.binding.expiresAt).toBe(rows[0].expires_at.toISOString());
    const token = tokenOf(deviceCookie(res)!);
    const device = (await pool.query('SELECT token_hash, csrf_hash FROM app.browser_devices')).rows[0];
    expect(device.token_hash).not.toBe(token);
    expect(device.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(device.csrf_hash).not.toBe(res.body.csrfToken);
    const ref = (await pool.query('SELECT cedula_fingerprint FROM app.patient_refs')).rows[0];
    expect(ref.cedula_fingerprint).toBe(fingerprintOf(AFFILIATED));
  });

  it('4.5: el reto queda consumido con la hora de app.clock_now()', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 300);
    await verifyCode(app, accepted.cookie, { challengeId, code });
    const { rows } = await pool.query(
      'SELECT consumed_at IS NOT NULL AS consumed, abs(extract(epoch FROM consumed_at - app.clock_now())) AS secs FROM app.otp_challenges WHERE id = $1',
      [challengeId],
    );
    expect(rows[0].consumed).toBe(true);
    expect(Number(rows[0].secs)).toBeLessThan(5);
  });

  it('4.9: con el reloj 9 minutos adelante el código se acepta', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 540);
    expect((await verifyCode(app, accepted.cookie, { challengeId, code })).status).toBe(200);
  });
});

describe('código incorrecto y peticiones inválidas (criterios 4.6 a 4.8, 8.4)', () => {
  it('4.6: un código distinto del real responde 422 code_incorrect con 2 intentos y no crea nada', async () => {
    const { challengeId, code } = await begin();
    const before = await countAllRows(pool);
    const wrong = differentCode(code);
    const first = await verifyCode(app, accepted.cookie, { challengeId, code: wrong });
    expect(first.status).toBe(422);
    expect(first.headers['content-type']).toContain('application/problem+json');
    expect(first.body).toMatchObject({ code: 'code_incorrect', status: 422, attemptsRemaining: 2 });
    expect(validateAgainstSchema('Problem', first.body)).toEqual([]);
    expect(setCookies(first)).toEqual([]);
    expect(diff(before, await countAllRows(pool))).toEqual({});
    const second = await verifyCode(app, accepted.cookie, { challengeId, code: wrong });
    expect(second.body.attemptsRemaining).toBe(1);
    const { rows } = await pool.query('SELECT attempts_used, consumed_at FROM app.otp_challenges WHERE id = $1', [challengeId]);
    expect(rows[0]).toEqual({ attempts_used: 2, consumed_at: null });
  });

  describe('4.7: peticiones que no se aceptan no crean filas ni cookie', () => {
    const valid = { challengeId: randomUUID(), code: '123456' };
    const cases: Array<[string, (a: Accepted) => { cookie: string | null; body: unknown; origin?: string | null }, number]> = [
      ['sin cookie de consentimiento', () => ({ cookie: null, body: valid }), 401],
      ['firma alterada', (a) => ({ cookie: a.cookie.slice(0, -2) + (a.cookie.endsWith('AA') ? 'BB' : 'AA'), body: valid }), 401],
      ['sin Origin', (a) => ({ cookie: a.cookie, body: valid, origin: null }), 403],
      ['Origin de otro sitio', (a) => ({ cookie: a.cookie, body: valid, origin: 'https://sitio-ajeno.example' }), 403],
      ['challengeId que no es UUID', (a) => ({ cookie: a.cookie, body: { ...valid, challengeId: 'no-es-uuid' } }), 400],
      ['código de 5 dígitos', (a) => ({ cookie: a.cookie, body: { ...valid, code: '12345' } }), 400],
      ['código de 7 dígitos', (a) => ({ cookie: a.cookie, body: { ...valid, code: '1234567' } }), 400],
      ['código con letras', (a) => ({ cookie: a.cookie, body: { ...valid, code: 'abcdef' } }), 400],
      ['código vacío', (a) => ({ cookie: a.cookie, body: { ...valid, code: '' } }), 400],
      ['campo extra', (a) => ({ cookie: a.cookie, body: { ...valid, declarant: 'holder' } }), 400],
    ];
    it.each(cases)('%s', async (_name, build, status) => {
      const before = await countAllRows(pool);
      const { cookie, body, origin } = build(accepted);
      const res = await verifyCode(app, cookie, body, { origin });
      expect(res.status).toBe(status);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(setCookies(res)).toEqual([]);
      expect(await countAllRows(pool)).toEqual(before);
    });
  });

  it('4.8: el código de otro reto, o un challengeId inexistente, dan 422 code_incorrect sin tocar el reto ajeno ni crear filas', async () => {
    const a = await begin(AFFILIATED);
    const b = await begin(AFFILIATED_NO_EMAIL);
    const before = await countAllRows(pool);
    const mixed = await verifyCode(app, accepted.cookie, { challengeId: b.challengeId, code: a.code });
    const missing = await verifyCode(app, accepted.cookie, { challengeId: randomUUID(), code: a.code });
    for (const res of [mixed, missing]) {
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('code_incorrect');
      expect(setCookies(res)).toEqual([]);
      expect(JSON.stringify(res)).not.toContain(AFFILIATED);
    }
    expect(Object.keys(mixed.body).sort()).toEqual(Object.keys(missing.body).sort());
    expect(diff(before, await countAllRows(pool))).toEqual({});
    const rows = (await pool.query('SELECT id, consumed_at, attempts_used FROM app.otp_challenges')).rows;
    const reto = (id: string) => rows.find((r) => r.id === id);
    // El reto de cuyo código se trataba sigue intacto y el reto usado en la petición no se consumió.
    expect(reto(a.challengeId)).toMatchObject({ consumed_at: null, attempts_used: 0 });
    expect(reto(b.challengeId).consumed_at).toBeNull();
  });

  it('8.4: el reto de una cédula inexistente nunca se acepta y responde igual que un código incorrecto', async () => {
    const wrong = await begin();
    const wrongRes = await verifyCode(app, accepted.cookie, { challengeId: wrong.challengeId, code: differentCode(wrong.code) });
    const unknown = await requestCode(app, accepted.cookie, UNKNOWN);
    const unknownRes = await verifyCode(app, accepted.cookie, { challengeId: unknown.body.challengeId, code: '000000' });
    expect(unknownRes.status).toBe(wrongRes.status);
    expect(unknownRes.body.code).toBe(wrongRes.body.code);
    expect(Object.keys(unknownRes.body).sort()).toEqual(Object.keys(wrongRes.body).sort());
    expect(setCookies(unknownRes)).toEqual([]);
  });

  it('9.4: ninguna respuesta de error de /identity/* incluye cédula, nombre, celular, correo ni huella', async () => {
    const { challengeId, code } = await begin();
    const unknown = await requestCode(app, accepted.cookie, UNKNOWN);
    const responses = [
      await requestCode(app, null, AFFILIATED),
      await requestCode(app, accepted.cookie, AFFILIATED, null),
      await requestCode(app, accepted.cookie, 'abc'),
      await verifyCode(app, null, { challengeId, code }),
      await verifyCode(app, accepted.cookie, { challengeId, code: '12345' }),
      await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) }),
      await verifyCode(app, accepted.cookie, { challengeId: unknown.body.challengeId, code: '000000' }),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 403, 400, 401, 400, 422, 422]);
    const secrets = [AFFILIATED, UNKNOWN, 'Paciente Ficticio', '3000000001', 'paciente1@example.invalid', fingerprintOf(AFFILIATED), fingerprintOf(UNKNOWN)];
    for (const res of responses) {
      const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });

  it('T.3: las respuestas de la verificación (200 y errores) llevan nosniff y CSP', async () => {
    const { challengeId, code } = await begin();
    const bad = await verifyCode(app, accepted.cookie, { challengeId, code: differentCode(code) });
    const ok = await verifyCode(app, accepted.cookie, { challengeId, code });
    const denied = await verifyCode(app, null, { challengeId, code });
    for (const res of [ok, bad, denied]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    }
    for (const res of [bad, denied]) expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('la aceptación queda registrada (criterios 5.1 a 5.5)', () => {
  it.each(['third_party', 'holder'] as const)('5.1 y 5.4: aceptó "%s" y la fila sale de la cookie, no del cuerpo', async (declarant) => {
    const cookie = await acceptNotice(app, declarant);
    const { challengeId, code } = await begin(AFFILIATED, cookie.cookie);
    // Un cuerpo con valores distintos se rechaza (campo extra): no cambia lo que se registra.
    const other = declarant === 'holder' ? 'third_party' : 'holder';
    const tampered = await verifyCode(app, cookie.cookie, { challengeId, code, declarant: other, noticeVersion: 'otra', acceptedAt: '2000-01-01T00:00:00Z' });
    expect(tampered.status).toBe(400);
    expect((await pool.query('SELECT 1 FROM app.consent_records')).rowCount).toBe(0);
    expect((await verifyCode(app, cookie.cookie, { challengeId, code })).status).toBe(200);
    const { rows } = await pool.query('SELECT * FROM app.consent_records');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'data_processing',
      declarant,
      channel: 'web',
      notice_version: cookie.payload.noticeVersion,
      cedula_fingerprint: fingerprintOf(AFFILIATED),
    });
  });

  it('5.2: accepted_at es el de la cookie (al milisegundo), no la hora de la verificación', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 300);
    await verifyCode(app, accepted.cookie, { challengeId, code });
    const { rows } = await pool.query('SELECT accepted_at, extract(epoch FROM recorded_at - accepted_at) AS secs FROM app.consent_records');
    expect(rows[0].accepted_at.toISOString()).toBe(accepted.payload.acceptedAt);
    expect(Number(rows[0].secs)).toBeGreaterThanOrEqual(300);
  });

  it('5.3: recorded_at es la hora de app.clock_now() (con el reloj adelantado)', async () => {
    const { challengeId, code } = await begin();
    await setClockOffset(pool, 300);
    await verifyCode(app, accepted.cookie, { challengeId, code });
    const { rows } = await pool.query('SELECT abs(extract(epoch FROM recorded_at - app.clock_now())) AS secs FROM app.consent_records');
    expect(Number(rows[0].secs)).toBeLessThan(5);
  });

  it('5.5: antes de verificar no hay consentimiento para esa huella', async () => {
    await begin();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM app.consent_records WHERE cedula_fingerprint = $1', [fingerprintOf(AFFILIATED)]);
    expect(rows[0].n).toBe(0);
  });
});

describe('el mismo código no se usa dos veces (criterios 6.1, 6.3, 6.4)', () => {
  it('6.1: repetir el código aceptado responde 410 code_superseded y no crea nada', async () => {
    const { challengeId, code } = await begin();
    expect((await verifyCode(app, accepted.cookie, { challengeId, code })).status).toBe(200);
    const before = await countAllRows(pool);
    const again = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(again.status).toBe(410);
    expect(again.headers['content-type']).toContain('application/problem+json');
    expect(again.body.code).toBe('code_superseded');
    expect(setCookies(again)).toEqual([]);
    expect(await countAllRows(pool)).toEqual(before);
  });

  it('6.3: dos peticiones simultáneas con el mismo código: una responde 200 y la otra 410', async () => {
    const { challengeId, code } = await begin();
    const before = await countAllRows(pool);
    const results = await Promise.all([
      verifyCode(app, accepted.cookie, { challengeId, code }),
      verifyCode(app, accepted.cookie, { challengeId, code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
    expect(results.find((r) => r.status === 410)!.body.code).toBe('code_superseded');
    expect(diff(before, await countAllRows(pool))).toEqual(ROWS_OF_A_VERIFICATION);
  });

  it('6.4: si falla el registro del consentimiento no queda nada y el código se puede intentar de nuevo', async () => {
    const { challengeId, code } = await begin();
    await pool.query(`CREATE OR REPLACE FUNCTION app.f003_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado de la prueba'; END $$`);
    await pool.query('CREATE TRIGGER f003_fail BEFORE INSERT ON app.consent_records FOR EACH ROW EXECUTE FUNCTION app.f003_fail()');
    const before = await countAllRows(pool);
    let failed;
    try {
      failed = await verifyCode(app, accepted.cookie, { challengeId, code });
    } finally {
      await pool.query('DROP TRIGGER f003_fail ON app.consent_records');
      await pool.query('DROP FUNCTION app.f003_fail()');
    }
    expect(failed.status).toBe(500);
    expect(failed.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(failed.body)).not.toMatch(/fallo forzado|trigger|consent_records|pg_/i);
    expect(setCookies(failed)).toEqual([]);
    expect(await countAllRows(pool)).toEqual(before);
    expect((await pool.query('SELECT consumed_at FROM app.otp_challenges WHERE id = $1', [challengeId])).rows[0].consumed_at).toBeNull();
    expect((await verifyCode(app, accepted.cookie, { challengeId, code })).status).toBe(200);
  });
});

describe('segunda verificación del mismo paciente (criterios 4.11 y 4.12, Inferido)', () => {
  it('4.11: desde el mismo navegador reutiliza dispositivo y vinculación, reemite el mismo token y registra otra aceptación', async () => {
    const first = await begin();
    const r1 = await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code });
    const token = tokenOf(deviceCookie(r1)!);
    await setClockOffset(pool, 120); // F005: espera de 2 minutos entre dos pedidos de la misma cédula
    const second = await begin();
    const before = await countAllRows(pool);
    const bindingBefore = (await pool.query('SELECT id, expires_at FROM app.channel_bindings')).rows[0];
    const r2 = await verifyCode(app, accepted.cookie, { challengeId: second.challengeId, code: second.code }, { device: token });
    expect(r2.status).toBe(200);
    expect(validateAgainstSchema('VerificationResult', r2.body)).toEqual([]);
    expect(diff(before, await countAllRows(pool))).toEqual({ 'app.consent_records': 1 });
    const bindings = (await pool.query('SELECT id, expires_at FROM app.channel_bindings WHERE revoked_at IS NULL')).rows;
    expect(bindings).toEqual([bindingBefore]);
    expect(r2.body.binding.expiresAt).toBe(bindingBefore.expires_at.toISOString());
    expect(tokenOf(deviceCookie(r2)!)).toBe(token);
  });

  it('4.12: desde otro navegador reutiliza al paciente y crea otro dispositivo y otra vinculación', async () => {
    const first = await begin();
    const r1 = await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code });
    await setClockOffset(pool, 120); // F005: espera de 2 minutos entre dos pedidos de la misma cédula
    const second = await begin();
    const before = await countAllRows(pool);
    const r2 = await verifyCode(app, accepted.cookie, { challengeId: second.challengeId, code: second.code });
    expect(r2.status).toBe(200);
    expect(diff(before, await countAllRows(pool))).toEqual({ 'app.browser_devices': 1, 'app.channel_bindings': 1, 'app.consent_records': 1 });
    expect(tokenOf(deviceCookie(r2)!)).not.toBe(tokenOf(deviceCookie(r1)!));
    expect(r2.body.binding.patientRefId).toBe(r1.body.binding.patientRefId);
  });

  it('una cookie de dispositivo desconocida se trata como navegador nuevo', async () => {
    const { challengeId, code } = await begin();
    const res = await verifyCode(app, accepted.cookie, { challengeId, code }, { device: 'token-que-no-existe' });
    expect(res.status).toBe(200);
    expect(tokenOf(deviceCookie(res)!)).not.toBe('token-que-no-existe');
  });

  it('una vinculación vencida del mismo navegador se revoca y se crea otra de 3 meses', async () => {
    const first = await begin();
    const r1 = await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code });
    const token = tokenOf(deviceCookie(r1)!);
    // 4 meses después la vinculación venció; se pide un código nuevo (el anterior ya está consumido).
    await setClockOffset(pool, 4 * 30 * 86400);
    const late = await begin();
    const res = await verifyCode(app, accepted.cookie, { challengeId: late.challengeId, code: late.code }, { device: token });
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM app.channel_bindings ORDER BY created_at');
    expect(rows.map((r) => r.revoked)).toEqual([true, false]);
    expect(tokenOf(deviceCookie(res)!)).toBe(token);
  });
});

describe('pedir el código tras verificar y retos anteriores', () => {
  it('un código nuevo anula el anterior: el código viejo ya no se acepta', async () => {
    const first = await begin();
    await pool.query('TRUNCATE app.captured_messages');
    await setClockOffset(pool, 120); // F005: espera de 2 minutos entre dos pedidos de la misma cédula
    await requestCode(app, accepted.cookie, AFFILIATED);
    await waitForMessages(pool, 2);
    const res = await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('code_superseded');
  });
});
