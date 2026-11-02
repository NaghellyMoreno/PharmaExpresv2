import { readFileSync } from 'node:fs';
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConsentCookieService } from '../src/modules/identity/consent-cookie.service.js';
import { generateOtpCode } from '../src/modules/identity/identity-crypto.js';
import { renderOtpEmail, renderOtpSms } from '../src/modules/notifications/otp-templates.js';
import { EMAIL_SENDER, SMS_SENDER } from '../src/modules/notifications/messaging.js';
import { createTestApp } from './support/app.js';
import { trackSends } from './support/sends.js';
import { validateAgainstSchema } from './support/contract.js';
import {
  AFFILIATED,
  AFFILIATED_INACTIVE,
  AFFILIATED_NO_EMAIL,
  APPROVED_MESSAGE,
  FIXTURE_AFFILIATES,
  UNKNOWN,
  acceptNotice,
  capturedMessages,
  codeIn,
  countAllRows,
  createSeedPool,
  fingerprintOf,
  loadFixtureAffiliates,
  requestCode,
  resetIdentityData,
  waitForMessages,
  waitForSms,
  type Accepted,
} from './support/identity.js';

// F003, pasos 1 a 3 y 7 a 9 (pedir el código): contracts/F003.md. PostgreSQL real; mensajes en modo capture.

const affiliates = JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8')) as Array<{ cedula: string; fullName: string; mobilePhone: string; email: string | null }>;
const affiliate = (cedula: string) => affiliates.find((a) => a.cedula === cedula)!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Plantillas del anexo, escritas aquí a propósito (criterios 3.4 y T.1).
const smsFor = (code: string) => `Pharma Express: tu codigo de verificacion es ${code}. Vence en 10 minutos.`;
const EMAIL_SUBJECT = 'Pharma Express: codigo de verificacion';
const emailFor = (code: string) => `Tu codigo de verificacion es ${code}. Vence en 10 minutos. Si no lo pediste, ignora este mensaje.`;

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
  await app.close();
  await pool.end();
});
afterEach(async () => {
  await sends.flush();
});
beforeEach(async () => {
  await resetIdentityData(pool);
  accepted = await acceptNotice(app, 'third_party');
});

const diff = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => [k, after[k] - before[k]]));

describe('pedir el código (criterios 1.2 a 1.6, 7.2)', () => {
  it('1.2 y 7.2: 202 con el mensaje aprobado, challengeId UUID y 120 segundos', async () => {
    const res = await requestCode(app, accepted.cookie, AFFILIATED);
    expect(res.status).toBe(202);
    expect(validateAgainstSchema('OtpRequestAccepted', res.body)).toEqual([]);
    expect(res.body.message).toBe(APPROVED_MESSAGE);
    expect(res.body.challengeId).toMatch(UUID);
    expect(res.body.resendAvailableInSeconds).toBe(120);
  });

  it('1.3: crea exactamente un reto con la huella HMAC, código con hash y vencimiento a 10 minutos', async () => {
    const res = await requestCode(app, accepted.cookie, AFFILIATED);
    const { rows } = await pool.query(
      `SELECT *, extract(epoch FROM expires_at - app.clock_now()) AS secs FROM app.otp_challenges`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.challengeId,
      purpose: 'verify',
      cedula_fingerprint: fingerprintOf(AFFILIATED),
      attempts_used: 0,
      consumed_at: null,
      superseded_at: null,
    });
    expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(rows[0].secs)).toBeGreaterThan(600 - 5);
    expect(Number(rows[0].secs)).toBeLessThanOrEqual(600);
  });

  describe('1.4: sin cookie válida o sin Origin válido no se crea nada', () => {
    const other = new ConsentCookieService('otra-clave-distinta-de-la-de-la-aplicacion');
    const cases: Array<[string, (a: Accepted) => { cookie: string | null; origin: string | null }, number]> = [
      ['sin cookie', () => ({ cookie: null, origin: process.env.APP_ORIGIN! }), 401],
      [
        'firma alterada',
        (a) => ({ cookie: a.cookie.slice(0, -2) + (a.cookie.endsWith('AA') ? 'BB' : 'AA'), origin: process.env.APP_ORIGIN! }),
        401,
      ],
      [
        'cookie de otra clave',
        (a) => ({
          cookie: `__Host-pe_consent=${other.sign(a.payload as Parameters<typeof other.sign>[0])}`,
          origin: process.env.APP_ORIGIN!,
        }),
        401,
      ],
      ['sin Origin', (a) => ({ cookie: a.cookie, origin: null }), 403],
      ['Origin de otro sitio', (a) => ({ cookie: a.cookie, origin: 'https://sitio-ajeno.example' }), 403],
    ];
    it.each(cases)('%s', async (_name, build, status) => {
      const before = await countAllRows(pool);
      const { cookie, origin } = build(accepted);
      const res = await requestCode(app, cookie, AFFILIATED, origin);
      expect(res.status).toBe(status);
      expect(res.headers['content-type']).toContain('application/problem+json');
      await new Promise((r) => setTimeout(r, 300));
      expect(await countAllRows(pool)).toEqual(before);
      expect(await capturedMessages(pool)).toEqual([]);
    });
  });

  it.each([
    ['abc', 'abc'],
    ['vacía', ''],
    ['de 4 dígitos', '1234'],
    ['de 13 dígitos', '1234567890123'],
    ['con espacios', '1000 000 001'],
    ['número en lugar de texto', 1000000001],
  ])('1.5: cédula %s responde 400 sin crear filas', async (_name, cedula) => {
    const before = await countAllRows(pool);
    const res = await requestCode(app, accepted.cookie, cedula);
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(await countAllRows(pool)).toEqual(before);
  });

  it('1.5: un campo extra o sin cédula responde 400 sin crear filas', async () => {
    const before = await countAllRows(pool);
    for (const body of [{ cedula: AFFILIATED, x: 1 }, {}]) {
      const res = await requestCode(app, accepted.cookie, body);
      expect(res.status).toBe(400);
    }
    expect(await countAllRows(pool)).toEqual(before);
  });

  it('1.6 y 5.5: pedir el código no crea consentimiento, paciente, navegador ni vinculación', async () => {
    const before = await countAllRows(pool);
    await requestCode(app, accepted.cookie, AFFILIATED);
    await waitForMessages(pool, 2);
    expect(diff(before, await countAllRows(pool))).toEqual({ 'app.otp_challenges': 1, 'app.captured_messages': 2 });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM app.consent_records WHERE cedula_fingerprint = $1', [fingerprintOf(AFFILIATED)]);
    expect(rows[0].n).toBe(0);
  });
});

describe('envío del código (criterios 2.1 a 2.4)', () => {
  it('2.1: llegan exactamente un SMS al celular y un correo al correo del afiliado', async () => {
    await requestCode(app, accepted.cookie, AFFILIATED);
    const msgs = await waitForMessages(pool, 2);
    await new Promise((r) => setTimeout(r, 300));
    const all = await capturedMessages(pool);
    expect(msgs.length).toBe(2);
    expect(all).toHaveLength(2);
    const sms = all.find((m) => m.channel === 'sms')!;
    const email = all.find((m) => m.channel === 'email')!;
    expect(sms.destination).toBe(affiliate(AFFILIATED).mobilePhone);
    expect(email.destination).toBe(affiliate(AFFILIATED).email);
  });

  it('2.2: un afiliado sin correo recibe solo el SMS', async () => {
    expect(affiliate(AFFILIATED_NO_EMAIL).email).toBeNull();
    await requestCode(app, accepted.cookie, AFFILIATED_NO_EMAIL);
    await waitForMessages(pool, 1);
    await new Promise((r) => setTimeout(r, 500));
    const all = await capturedMessages(pool);
    expect(all.map((m) => m.channel)).toEqual(['sms']);
    expect(all[0].destination).toBe(affiliate(AFFILIATED_NO_EMAIL).mobilePhone);
  });

  // Lista fija de pruebas (medications.json y diagnoses.json aún no existen).
  const FORBIDDEN = ['Medicamento Ficticio A', 'Medicamento Ficticio B', 'Medicamento Ficticio C', 'Diagnóstico Ficticio X', 'Diagnóstico Ficticio Y'];
  const findForbidden = (text: string, extra: string[]) =>
    [...FORBIDDEN, ...extra].filter((s) => text.toLowerCase().includes(s.toLowerCase()));

  it('2.3: ningún mensaje contiene medicamentos, diagnósticos, cédula ni el nombre del afiliado (con control positivo)', async () => {
    const a = affiliate(AFFILIATED);
    const extra = [a.cedula, a.fullName];
    expect(FORBIDDEN.length + extra.length).toBeGreaterThanOrEqual(5);
    expect(findForbidden('Recoja el medicamento ficticio a mañana', extra)).toEqual(['Medicamento Ficticio A']);
    await requestCode(app, accepted.cookie, AFFILIATED);
    await waitForMessages(pool, 2);
    for (const m of await capturedMessages(pool)) {
      expect(findForbidden(`${m.subject ?? ''} ${m.body}`, extra)).toEqual([]);
    }
  });

  it('2.4: dos afiliados distintos reciben el mismo texto salvo el código', async () => {
    const texts: string[] = [];
    for (const cedula of [AFFILIATED, AFFILIATED_NO_EMAIL]) {
      await pool.query('TRUNCATE app.captured_messages, app.otp_challenges');
      await requestCode(app, accepted.cookie, cedula);
      const sms = (await waitForSms(pool))!;
      texts.push(sms.body.replace(codeIn(sms.body), '{code}'));
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toBe('Pharma Express: tu codigo de verificacion es {code}. Vence en 10 minutos.');
  });
});

describe('formato del código y de los mensajes (criterios 3.1 a 3.4)', () => {
  it('3.1: la función generadora produce 000000, 000005 y 999999 con randomInt forzado', () => {
    expect([0, 5, 999999].map((n) => generateOtpCode(() => n))).toEqual(['000000', '000005', '999999']);
  });

  it('3.1: el código del SMS y del correo es el mismo y cumple ^[0-9]{6}$ en 50 pedidos', async () => {
    for (let i = 0; i < 50; i++) {
      await pool.query('TRUNCATE app.captured_messages, app.otp_challenges');
      await requestCode(app, accepted.cookie, AFFILIATED);
      const msgs = await waitForMessages(pool, 2);
      const sms = msgs.find((m) => m.channel === 'sms')!;
      const email = msgs.find((m) => m.channel === 'email')!;
      expect(codeIn(sms.body)).toMatch(/^[0-9]{6}$/);
      expect(codeIn(email.body)).toBe(codeIn(sms.body));
    }
  });

  const ALLOWED = /^[A-Za-z0-9 .,:;\-()?!/]*$/;
  function smsRules(body: string) {
    return {
      prefijo: body.startsWith('Pharma Express:'),
      // Sin marcas diacríticas (tildes, ñ) y solo caracteres de la lista cerrada.
      sinTildes: !/\p{M}/u.test(body.normalize('NFD')),
      alfabeto: ALLOWED.test(body),
      longitud: body.length <= 160,
      unCodigo: (body.match(/\b\d{6}\b/g) ?? []).length === 1,
    };
  }
  const ALL_OK = { prefijo: true, sinTildes: true, alfabeto: true, longitud: true, unCodigo: true };

  it('3.2: el SMS capturado cumple las reglas (prefijo, sin tildes, alfabeto cerrado, 160, un código)', async () => {
    await requestCode(app, accepted.cookie, AFFILIATED);
    const sms = (await waitForSms(pool))!;
    expect(smsRules(sms.body)).toEqual(ALL_OK);
  });

  it('3.2: la plantilla cumple las reglas con el valor más largo posible y el detector marca lo que no cumple', () => {
    expect(smsRules(renderOtpSms('999999'))).toEqual(ALL_OK);
    expect(smsRules('Pharma Express: código 123456 ñandú')).toMatchObject({ sinTildes: false, alfabeto: false });
    expect(smsRules(`Pharma Express: ${'x'.repeat(150)} 123456`).longitud).toBe(false);
  });

  it('3.3: el correo tiene asunto, cuerpo, un código y el aviso de 10 minutos', async () => {
    await requestCode(app, accepted.cookie, AFFILIATED);
    const email = (await waitForMessages(pool, 2)).find((m) => m.channel === 'email')!;
    expect(email.subject).toBeTruthy();
    expect(email.body).toBeTruthy();
    expect((email.body.match(/\b\d{6}\b/g) ?? []).length).toBe(1);
    expect(email.body).toContain('Vence en 10 minutos');
  });

  it('3.4 y T.1: el SMS y el correo coinciden carácter por carácter con las plantillas del anexo', async () => {
    await requestCode(app, accepted.cookie, AFFILIATED);
    const msgs = await waitForMessages(pool, 2);
    const sms = msgs.find((m) => m.channel === 'sms')!;
    const email = msgs.find((m) => m.channel === 'email')!;
    const code = codeIn(sms.body);
    expect(sms.body).toBe(smsFor(code));
    expect(email.subject).toBe(EMAIL_SUBJECT);
    expect(email.body).toBe(emailFor(code));
    expect(renderOtpSms(code)).toBe(smsFor(code));
    expect(renderOtpEmail(code)).toEqual({ subject: EMAIL_SUBJECT, body: emailFor(code) });
  });
});

describe('cédula que no existe (criterios 8.1 a 8.5)', () => {
  it('8.2: responde 202 con el mismo mensaje y no envía ningún mensaje en 3 s', async () => {
    const res = await requestCode(app, accepted.cookie, UNKNOWN);
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(APPROVED_MESSAGE);
    expect(res.body.resendAvailableInSeconds).toBe(120);
    const msgs = await waitForMessages(pool, 1, 3000);
    expect(msgs).toEqual([]);
  });

  it('8.3: no crea cuenta; solo suma un reto sin código y con la huella de la cédula', async () => {
    const before = await countAllRows(pool);
    await requestCode(app, accepted.cookie, UNKNOWN);
    await new Promise((r) => setTimeout(r, 300));
    expect(diff(before, await countAllRows(pool))).toEqual({ 'app.otp_challenges': 1 });
    const { rows } = await pool.query('SELECT code_hash, cedula_fingerprint FROM app.otp_challenges');
    expect(rows).toEqual([{ code_hash: null, cedula_fingerprint: fingerprintOf(UNKNOWN) }]);
  });

  it('8.5 (Inferido): una afiliada inactiva recibe el mismo 202, mensaje y claves, sin revelar el estado', async () => {
    const base = await requestCode(app, accepted.cookie, AFFILIATED);
    const inactive = await requestCode(app, accepted.cookie, AFFILIATED_INACTIVE);
    expect(inactive.status).toBe(202);
    expect(inactive.body.message).toBe(base.body.message);
    expect(Object.keys(inactive.body).sort()).toEqual(Object.keys(base.body).sort());
    expect(JSON.stringify(inactive.body)).not.toMatch(/inactiv|inactive/i);
  });
});

describe('la API no distingue cédulas afiliadas de inexistentes (criterios 9.1 a 9.3, T.3)', () => {
  const dump = (res: { status: number; headers: Record<string, unknown>; body: { challengeId: string } }) => {
    const headers = { ...res.headers };
    delete headers.date;
    return JSON.stringify({ status: res.status, headers: Object.entries(headers).sort(), body: { ...res.body, challengeId: '<id>' } });
  };

  it('9.1: mismo estado, mismos encabezados (salvo Date) y mismo cuerpo (salvo challengeId)', async () => {
    const known = await requestCode(app, accepted.cookie, AFFILIATED);
    const unknown = await requestCode(app, accepted.cookie, UNKNOWN);
    expect(known.status).toBe(202);
    expect(known.body.challengeId).not.toBe(unknown.body.challengeId);
    expect(dump(known as never)).toBe(dump(unknown as never));
  });

  it('9.2: no hay Set-Cookie ni datos del paciente (nombre, EPS, celular, correo) en las respuestas', async () => {
    const a = affiliate(AFFILIATED);
    for (const cedula of [AFFILIATED, UNKNOWN]) {
      const res = await requestCode(app, accepted.cookie, cedula);
      expect(res.headers['set-cookie']).toBeUndefined();
      const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
      for (const secret of [a.fullName, 'Salud Total y', 'salud_total', a.mobilePhone, a.mobilePhone.slice(-4), a.email!, 'example.invalid', a.cedula]) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('9.3: el tiempo de respuesta no distingue los dos casos (mediana de la diferencia menor que 200 ms)', async () => {
    const times: Record<'known' | 'unknown', number[]> = { known: [], unknown: [] };
    for (let i = 0; i < 20; i++) {
      const kind = i % 2 === 0 ? 'known' : 'unknown';
      const cedula = kind === 'unknown' ? UNKNOWN : i % 4 === 0 ? AFFILIATED : AFFILIATED_NO_EMAIL;
      await pool.query('TRUNCATE app.otp_challenges');
      const t0 = performance.now();
      const res = await requestCode(app, accepted.cookie, cedula);
      times[kind].push(performance.now() - t0);
      expect(res.status).toBe(202);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(times.known).toHaveLength(10);
    expect(median(times.known) - median(times.unknown)).toBeLessThan(200);
  });

  it('T.3: las respuestas llevan nosniff y Content-Security-Policy; los errores son problem+json con los campos de Problem', async () => {
    const ok = await requestCode(app, accepted.cookie, AFFILIATED);
    const bad = await requestCode(app, accepted.cookie, 'abc');
    const denied = await requestCode(app, null, AFFILIATED);
    for (const res of [ok, bad, denied]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    }
    for (const res of [bad, denied]) {
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(validateAgainstSchema('Problem', res.body)).toEqual([]);
    }
  });
});

// R.3: un adaptador que falla no cambia la respuesta y el error se registra sin destinatario ni cuerpo.
describe('fallos de los adaptadores de envío (R.3)', () => {
  const lines: string[] = [];
  const sink: LoggerService = {
    log: (m) => lines.push(String(m)),
    error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
    warn: (m) => lines.push(String(m)),
    debug: (m) => lines.push(String(m)),
    verbose: (m) => lines.push(String(m)),
  };
  const failing = { send: () => Promise.reject(new Error(`falla simulada para ${affiliate(AFFILIATED).mobilePhone} ${affiliate(AFFILIATED).email}`)) };

  it('el pedido sigue respondiendo 202 y los registros no llevan destinatario, cuerpo, cédula ni código', async () => {
    const failApp = await createTestApp({ logger: sink, overrides: [[SMS_SENDER, failing], [EMAIL_SENDER, failing]] });
    const failSends = trackSends(failApp);
    try {
      const cookie = (await acceptNotice(failApp)).cookie;
      const res = await requestCode(failApp, cookie, AFFILIATED);
      await failSends.flush();
      expect(res.status).toBe(202);
      expect(res.body.message).toBe(APPROVED_MESSAGE);
      const all = lines.join('\n');
      expect(all).toMatch(/No se pudo enviar/);
      const a = affiliate(AFFILIATED);
      for (const secret of [a.mobilePhone, a.email!, a.cedula, 'falla simulada', 'Pharma Express']) expect(all).not.toContain(secret);
      expect(all).not.toMatch(/\b\d{6,12}\b/);
      expect(await capturedMessages(pool)).toEqual([]);
    } finally {
      await failApp.close();
    }
  });
});
