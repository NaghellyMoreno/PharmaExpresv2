import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from './support/app';
import { validateAgainstSchema } from './support/contract';
import {
  AFFILIATED,
  FIXTURE_AFFILIATES,
  ORIGIN,
  UNKNOWN,
  acceptNotice,
  capturedMessages,
  codeIn,
  createSeedPool,
  differentCode,
  fingerprintOf,
  loadFixtureAffiliates,
  requestCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  waitForSms,
  type Accepted,
} from './support/identity';
import { trackSends } from './support/sends';
import { A, WEBHOOK, captureLogs, logSink, message, press, rowDiff, rowMap, text } from './support/telegram';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT } from '../src/modules/telegram/telegram-transport';

// F005, pasos 5 a 7 (espera de 2 minutos, anulación del código anterior y máximo de 5 por hora) más transversales y registros.
// PostgreSQL real; mensajes y Telegram en modo capture. Las cadenas están escritas aquí a propósito.

vi.setConfig({ testTimeout: 60000 });

const AFFILIATED_2 = '1000000002';
const CODE_NOT_SENT = 'No pudimos enviar el código. Intente de nuevo.';
const FORBIDDEN = ['Medicamento Ficticio A', 'Medicamento Ficticio B', 'Medicamento Ficticio C', 'Diagnóstico Ficticio X', 'Diagnóstico Ficticio Y'];
const affiliates = JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8')) as Array<{ cedula: string; mobilePhone: string; email: string | null; fullName: string }>;

let app: NestExpressApplication;
let pool: Pool;
let accepted: Accepted;
let sends: ReturnType<typeof trackSends>;
let transport: CaptureTelegramTransport;

beforeAll(async () => {
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
  app = await createTestApp({ logger: logSink });
  sends = trackSends(app);
  transport = app.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
});
afterAll(async () => {
  await setClockOffset(pool, 0);
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  transport.reset();
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
  accepted = await acceptNotice(app, 'third_party');
});
// T.7: toda prueba que mueve app.test_clock lo restablece a 0 y borra los retos que creó.
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
  vi.restoreAllMocks();
});

const at = (seconds: number) => setClockOffset(pool, seconds);
/** Pide un código con el reloj en `seconds` (si se indica) y espera el envío. */
async function ask(cedula = AFFILIATED, seconds?: number, cookie = accepted.cookie) {
  if (seconds !== undefined) await at(seconds);
  const res = await requestCode(app, cookie, cedula);
  await sends.flush();
  return res;
}
/** Pide y devuelve el reto con el código del SMS más reciente. */
async function begin(cedula = AFFILIATED, seconds?: number) {
  await pool.query('TRUNCATE app.captured_messages');
  const res = await ask(cedula, seconds);
  if (res.status !== 202) throw new Error(`El pedido respondió ${res.status}`);
  const sms = await waitForSms(pool);
  return { challengeId: res.body.challengeId as string, code: sms ? codeIn(sms.body) : '' };
}
const challenges = async (cedula = AFFILIATED) =>
  (await pool.query('SELECT * FROM app.otp_challenges WHERE cedula_fingerprint = $1 ORDER BY created_at', [fingerprintOf(cedula)])).rows;
const quiet = async (before: number, ms = 3000) => {
  await new Promise((r) => setTimeout(r, ms));
  expect((await capturedMessages(pool)).length).toBe(before);
};
const clockNow = async () => (await pool.query<{ now: Date }>('SELECT app.clock_now() AS now')).rows[0].now;
const within5s = (value: Date, reference: Date) => Math.abs(value.getTime() - reference.getTime()) <= 5000;
const stripVolatile = (body: Record<string, unknown>) => {
  const { correlationId: _c, retryAfterSeconds: _r, ...rest } = body;
  return rest;
};
const REPEATED = [0, 120, 240, 360, 480];
const A_VERIFICATION = { 'app.patient_refs': 1, 'app.browser_devices': 1, 'app.channel_bindings': 1, 'app.consent_records': 1 };
const insertChallenge = (cedula: string, purpose: string, createdAgo: string, superseded: boolean) =>
  pool.query(
    `INSERT INTO app.otp_challenges (cedula_fingerprint, purpose, expires_at, created_at, superseded_at)
     VALUES ($1, $2, app.clock_now() + interval '10 minutes', app.clock_now() - $3::interval, ${superseded ? 'app.clock_now()' : 'NULL'})`,
    [fingerprintOf(cedula), purpose, createdAgo],
  );

describe('paso 5: pedir un código nuevo antes de 2 minutos se rechaza', () => {
  it('5.1 el segundo pedido inmediato responde 429 code_too_soon con retryAfterSeconds y Retry-After', async () => {
    expect((await ask()).status).toBe(202);
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('code_too_soon');
    expect(Number.isInteger(res.body.retryAfterSeconds)).toBe(true);
    expect(res.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(120);
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfterSeconds));
    expect(validateAgainstSchema('Problem', res.body)).toEqual([]);
  });

  it('5.2 y 5.3 el pedido rechazado no deja rastro y el código del primero sigue sirviendo', async () => {
    const first = await begin();
    const before = await rowMap(pool);
    const messages = (await capturedMessages(pool)).length;
    expect((await ask()).status).toBe(429);
    await quiet(messages);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    const rows = await challenges();
    expect(rows).toHaveLength(1);
    expect(rows[0].superseded_at).toBeNull();
    const verified = await verifyCode(app, accepted.cookie, first);
    expect(verified.status).toBe(200);
  });

  it('5.4 borde: a 115 s responde 429 con 1 a 5 s de espera y a 120 s responde 202', async () => {
    await ask();
    const early = await ask(AFFILIATED, 115);
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('code_too_soon');
    expect(early.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(early.body.retryAfterSeconds).toBeLessThanOrEqual(5);
    expect((await ask(AFFILIATED, 120)).status).toBe(202);
  });

  it('5.5 una cédula inexistente recibe el mismo 429, sin revelar la afiliación', async () => {
    const results: Array<{ status: number; body: Record<string, unknown>; retryAfter: number }> = [];
    for (const cedula of [AFFILIATED, UNKNOWN]) {
      await ask(cedula);
      const res = await ask(cedula);
      results.push({ status: res.status, body: res.body, retryAfter: Number(res.headers['retry-after']) });
    }
    expect(results[0].status).toBe(429);
    expect(results[1].status).toBe(429);
    expect(stripVolatile(results[1].body)).toEqual(stripVolatile(results[0].body));
    expect(Math.abs((results[0].body.retryAfterSeconds as number) - (results[1].body.retryAfterSeconds as number))).toBeLessThanOrEqual(2);
    expect(Math.abs(results[0].retryAfter - results[1].retryAfter)).toBeLessThanOrEqual(2);
  });

  it('5.6 los pedidos con formato inválido (400) o sin cookie (401) no cuentan para el límite', async () => {
    for (const bad of ['abc', '123', '']) expect((await requestCode(app, accepted.cookie, bad)).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await requestCode(app, null, AFFILIATED)).status).toBe(401);
    expect(await challenges()).toHaveLength(0);
    expect((await ask()).status).toBe(202);
  });

  it('5.7 concurrencia: dos pedidos simultáneos dan una respuesta 202 y una 429, en 10 vueltas', async () => {
    for (let round = 0; round < 10; round++) {
      // Regla del reloj (ii): sin retos y reloj en 0 al comienzo de cada vuelta.
      await sends.flush();
      await resetIdentityData(pool);
      await at(0);
      const results = await Promise.all([requestCode(app, accepted.cookie, AFFILIATED), requestCode(app, accepted.cookie, AFFILIATED)]);
      await sends.flush();
      expect(results.map((r) => r.status).sort(), `vuelta ${round}`).toEqual([202, 429]);
      expect(results.find((r) => r.status === 429)!.body.code).toBe('code_too_soon');
      expect(await challenges()).toHaveLength(1);
    }
  });
});

describe('paso 6: el código nuevo anula el anterior', () => {
  it('6.1 el reto A queda anulado, el B vigente y la base impide dos vigentes', async () => {
    const a = await begin();
    const b = await begin(AFFILIATED, 120);
    const rows = await challenges();
    const rowA = rows.find((r) => r.id === a.challengeId);
    const rowB = rows.find((r) => r.id === b.challengeId);
    expect(rowA.superseded_at).not.toBeNull();
    expect(within5s(rowA.superseded_at, await clockNow())).toBe(true);
    expect(rowB.superseded_at).toBeNull();
    await expect(
      pool.query(
        `INSERT INTO app.otp_challenges (cedula_fingerprint, purpose, expires_at) VALUES ($1, 'verify', app.clock_now() + interval '10 minutes')`,
        [fingerprintOf(AFFILIATED)],
      ),
    ).rejects.toThrow(/otp_challenges_one_live_per_fingerprint|duplicate key/);
  });

  it('6.2 el código de A con el reto A responde 410 code_superseded y no cambia nada', async () => {
    const a = await begin();
    await begin(AFFILIATED, 120);
    const before = await rowMap(pool);
    const attempts = (await challenges())[0].attempts_used;
    const res = await verifyCode(app, accepted.cookie, a);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('code_superseded');
    expect((res.headers['set-cookie'] as string[] | undefined) ?? []).toEqual([]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    const rowA = (await challenges()).find((r) => r.id === a.challengeId);
    expect(rowA.consumed_at).toBeNull();
    expect(rowA.attempts_used).toBe(attempts);
  });

  it('6.3 el código de A con el reto B responde 422 con 2 intentos restantes', async () => {
    let a = { challengeId: '', code: '' };
    let b = { challengeId: '', code: '' };
    for (let tries = 0; tries < 20; tries++) {
      // Regla del reloj (ii): cada vuelta parte sin retos y con el reloj en 0.
      await resetIdentityData(pool);
      await at(0);
      a = await begin();
      b = await begin(AFFILIATED, 120);
      if (a.code !== b.code) break;
    }
    expect(a.code).not.toBe(b.code);
    const res = await verifyCode(app, accepted.cookie, { challengeId: b.challengeId, code: a.code });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('code_incorrect');
    expect(res.body.attemptsRemaining).toBe(2);
  });

  it('6.4 el código de B con el reto B responde 200 con las filas de una verificación', async () => {
    await begin();
    const b = await begin(AFFILIATED, 120);
    const before = await rowMap(pool);
    const res = await verifyCode(app, accepted.cookie, b);
    expect(res.status).toBe(200);
    const diff = rowDiff(before, await rowMap(pool));
    expect(diff).toMatchObject(A_VERIFICATION);
  });

  it('6.5 un reto vigente de revocación también queda anulado al pedir un código de verificación', async () => {
    await insertChallenge(AFFILIATED, 'revoke', '10 minutes', false);
    expect((await challenges())[0].superseded_at).toBeNull();
    expect((await ask()).status).toBe(202);
    const rows = await challenges();
    expect(rows.find((r) => r.purpose === 'revoke').superseded_at).not.toBeNull();
    expect(rows.find((r) => r.purpose === 'verify').superseded_at).toBeNull();
  });
});

describe('paso 7: máximo 5 códigos por hora por cédula', () => {
  async function fiveRequests(cedula = AFFILIATED) {
    const codes: string[] = [];
    for (const seconds of REPEATED) codes.push((await begin(cedula, seconds)).code);
    return codes;
  }

  it('7.1 cinco pedidos separados por 120 s responden 202 y el sexto, 429 code_hourly_limit', async () => {
    for (const seconds of REPEATED) expect((await ask(AFFILIATED, seconds)).status, `a ${seconds} s`).toBe(202);
    const res = await ask(AFFILIATED, 600);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_hourly_limit');
    expect(res.body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(3600);
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfterSeconds));
    expect(validateAgainstSchema('Problem', res.body)).toEqual([]);
    // T.3
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('7.2 el sexto pedido no deja rastro y el quinto código sigue sirviendo', async () => {
    const codes: Array<{ challengeId: string; code: string }> = [];
    for (const seconds of REPEATED) codes.push(await begin(AFFILIATED, seconds));
    const before = await rowMap(pool);
    const messages = (await capturedMessages(pool)).length;
    expect((await ask(AFFILIATED, 600)).status).toBe(429);
    await quiet(messages);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    const rows = await challenges();
    expect(rows).toHaveLength(5);
    expect(rows[4].superseded_at).toBeNull();
    expect((await verifyCode(app, accepted.cookie, codes[4])).status).toBe(200);
  });

  it('7.3 borde de la ventana deslizante (Inferido): a 3590 s sigue el límite y a 3601 s ya hay cupo', async () => {
    for (const seconds of REPEATED) await ask(AFFILIATED, seconds);
    const blocked = await ask(AFFILIATED, 3590);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('code_hourly_limit');
    expect((await ask(AFFILIATED, 3601)).status).toBe(202);
  });

  it('7.4 los retos consumidos o anulados cuentan', async () => {
    const codes: Array<{ challengeId: string; code: string }> = [];
    for (const seconds of REPEATED) codes.push(await begin(AFFILIATED, seconds));
    expect((await verifyCode(app, accepted.cookie, codes[4])).status).toBe(200);
    const rows = await challenges();
    expect(rows.filter((r) => r.consumed_at).length).toBe(1);
    expect(rows.filter((r) => r.superseded_at).length).toBe(4);
    const res = await ask(AFFILIATED, 600);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_hourly_limit');
  });

  it('7.5 el límite se comparte con los retos de revocación', async () => {
    await insertChallenge(AFFILIATED, 'revoke', '20 minutes', true);
    await insertChallenge(AFFILIATED, 'revoke', '10 minutes', true);
    for (const seconds of [0, 120, 240]) expect((await ask(AFFILIATED, seconds)).status).toBe(202);
    const res = await ask(AFFILIATED, 360);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_hourly_limit');
  });

  it('7.6 el límite es por cédula: otra cédula pide con normalidad y otro navegador no abre un cupo nuevo', async () => {
    for (const seconds of REPEATED) await ask(AFFILIATED, seconds);
    await at(600);
    expect((await ask(AFFILIATED_2)).status).toBe(202);
    const other = await acceptNotice(app, 'holder');
    const res = await ask(AFFILIATED, undefined, other.cookie);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_hourly_limit');
  });

  it('7.7 una cédula inexistente tiene los mismos límites y el mismo 429', async () => {
    const sixth: Array<Awaited<ReturnType<typeof ask>>> = [];
    for (const cedula of [AFFILIATED, UNKNOWN]) {
      for (const seconds of REPEATED) expect((await ask(cedula, seconds)).status).toBe(202);
      sixth.push(await ask(cedula, 600));
    }
    expect(sixth.map((r) => r.status)).toEqual([429, 429]);
    expect(stripVolatile(sixth[1].body)).toEqual(stripVolatile(sixth[0].body));
    expect(sixth[0].body.code).toBe('code_hourly_limit');
    expect(Math.abs(sixth[0].body.retryAfterSeconds - sixth[1].body.retryAfterSeconds)).toBeLessThanOrEqual(2);
  });

  it('7.10 los pedidos directos a la API (sin navegador) están sujetos a los mismos límites', async () => {
    for (const seconds of REPEATED) {
      await at(seconds);
      const res = await request(app.getHttpServer())
        .post('/api/v1/identity/otp-requests')
        .set('Cookie', accepted.cookie)
        .set('Origin', ORIGIN())
        .set('User-Agent', 'curl/8.0')
        .send({ cedula: AFFILIATED });
      expect(res.status).toBe(202);
      await sends.flush();
    }
    await at(30);
    expect((await ask(AFFILIATED, 480 + 30)).body.code).toBe('code_too_soon');
    expect((await ask(AFFILIATED, 600)).body.code).toBe('code_hourly_limit');
  });

  it('7.1 con ambos límites vigentes gana la espera de 2 minutos (code_too_soon)', async () => {
    for (const seconds of REPEATED) await ask(AFFILIATED, seconds);
    const res = await ask(AFFILIATED, 485);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_too_soon');
  });
});

describe('Telegram: los mismos límites por la huella de la cédula', () => {
  const post = (update: unknown) => request(app.getHttpServer()).post(WEBHOOK).set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!).send(update as object);
  const sentTexts = () => transport.calls.filter((c) => c.method === 'sendMessage').map((c) => c.text);
  const conversation = async () => (await pool.query('SELECT conversation FROM telegram_chats WHERE chat_id = $1', [A])).rows[0].conversation;
  async function acceptAsHolder() {
    await post(message(A));
    await post(press(A, 'accept:holder'));
  }
  /** El chat vuelve a pedir la cédula con /start y la envía con el reloj en `seconds`. */
  async function botAsks(seconds: number) {
    await at(seconds);
    await post(message(A)).expect(200);
    transport.calls.length = 0;
    await post(text(A, AFFILIATED)).expect(200);
    await sends.flush();
  }

  it('7.8 la sexta cédula, alternando la API y el bot, no crea reto, no envía mensajes y recibe un solo mensaje de error', async () => {
    await acceptAsHolder();
    await ask(AFFILIATED, 0);
    await botAsks(120);
    expect(sentTexts()).toEqual([expect.stringContaining('Si la cédula está afiliada a Salud Total o Sanitas')]);
    await ask(AFFILIATED, 240);
    await botAsks(360);
    await ask(AFFILIATED, 480);
    expect(await challenges()).toHaveLength(5);
    const messages = (await capturedMessages(pool)).length;
    await botAsks(600);
    expect(transport.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1);
    expect(sentTexts()).toEqual([CODE_NOT_SENT]);
    expect(transport.calls[0].replyMarkup).toBeUndefined();
    await quiet(messages);
    expect(await challenges()).toHaveLength(5);
    expect((await conversation()).step).toBe('awaiting_cedula');
  });

  it('7.9 la API y el bot comparten la espera de 2 minutos en los dos sentidos', async () => {
    await acceptAsHolder();
    const apiCode = await begin(AFFILIATED, 0);
    const messages = (await capturedMessages(pool)).length;
    await botAsks(30);
    expect(sentTexts()).toEqual([CODE_NOT_SENT]);
    await quiet(messages, 1500);
    expect(await challenges()).toHaveLength(1);
    expect((await verifyCode(app, accepted.cookie, apiCode)).status).toBe(200);
    // A la inversa: pedir por el bot y luego por la API.
    await resetIdentityData(pool);
    await at(0);
    await botAsks(0);
    const res = await ask(AFFILIATED);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('code_too_soon');
  });
});

describe('transversales y registros', () => {
  it('T.2 ningún mensaje capturado de los cinco pedidos contiene medicamentos, diagnósticos, cédula ni enlaces', async () => {
    for (const seconds of REPEATED) await ask(AFFILIATED, seconds);
    const all = await capturedMessages(pool);
    expect(all.length).toBeGreaterThanOrEqual(5);
    const a = affiliates.find((x) => x.cedula === AFFILIATED)!;
    const found = all.flatMap((m) =>
      [...FORBIDDEN, a.cedula, a.fullName, 'http://', 'https://', 'www.'].filter((s) => `${m.subject ?? ''} ${m.body}`.toLowerCase().includes(s.toLowerCase())),
    );
    expect(found).toEqual([]);
    // Control positivo de la búsqueda.
    expect(['Recoja Medicamento Ficticio A'].flatMap((t) => FORBIDDEN.filter((s) => t.includes(s)))).toEqual(['Medicamento Ficticio A']);
  });

  it('T.8 con el límite en su tope, sin cookie responde 401 y con otro Origin responde 403 (no 429)', async () => {
    for (const seconds of REPEATED) await ask(AFFILIATED, seconds);
    await at(600);
    expect((await requestCode(app, null, AFFILIATED)).status).toBe(401);
    expect((await requestCode(app, accepted.cookie, AFFILIATED, 'https://otro.example')).status).toBe(403);
    expect((await requestCode(app, accepted.cookie, AFFILIATED, null)).status).toBe(403);
    expect((await verifyCode(app, null, { challengeId: '00000000-0000-4000-8000-000000000000', code: '123456' })).status).toBe(401);
  });

  describe('registros (invariante 8)', () => {
    const NEST_PREFIX = /^\S*\[Nest\]\s+\d+\s+-\s+\d{2}\/\d{2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+/;
    const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
    const stripNoise = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, '').replace(NEST_PREFIX, '').replace(ISO_TIMESTAMP, '');
    const detects = (line: string) => /\d{5,}/.test(stripNoise(line));

    it('R.1 el detector marca la línea sintética (control positivo) y no las marcas de tiempo', () => {
      expect(detects('usuario 1000000001 codigo 204871')).toBe(true);
      expect(detects('[Nest] 17637  - 11/02/2026, 10:48:17 AM   ERROR [X] sin datos')).toBe(false);
    });

    it('R.1 vencido, agotado, 429, anulado y pedidos por el bot y por la API no dejan datos en los registros', async () => {
      const secrets: string[] = [];
      const a = affiliates.find((x) => x.cedula === AFFILIATED)!;
      const logs = await captureLogs(async () => {
        const first = await begin();
        secrets.push(first.challengeId, first.code);
        await ask(); // espera de 2 minutos
        await at(601);
        await verifyCode(app, accepted.cookie, first); // vencido
        await resetIdentityData(pool);
        await at(0);
        const second = await begin();
        secrets.push(second.challengeId, second.code);
        for (let i = 0; i < 4; i++) await verifyCode(app, accepted.cookie, { challengeId: second.challengeId, code: differentCode(second.code) }); // agotado
        const third = await begin(AFFILIATED, 120);
        secrets.push(third.challengeId, third.code);
        await verifyCode(app, accepted.cookie, second); // anulado
        for (const seconds of [240, 360, 480]) await ask(AFFILIATED, seconds);
        await ask(AFFILIATED, 600); // límite por hora
        await post_(message(A));
        await post_(press(A, 'accept:holder'));
        await post_(text(A, AFFILIATED)); // pedido rechazado por el bot
        await sends.flush();
      });
      const lines = logs.split('\n').filter((l) => l.trim() !== '');
      expect(lines.filter(detects)).toEqual([]);
      const needles = [AFFILIATED, ...secrets, a.mobilePhone, a.email!, process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_WEBHOOK_SECRET!];
      for (const needle of needles) expect(logs).not.toContain(needle);
    });

    const post_ = (update: unknown) =>
      request(app.getHttpServer()).post(WEBHOOK).set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!).send(update as object);

    it('R.2 ninguna fila nueva guarda la cédula ni el código en claro tras los cinco pedidos', async () => {
      const codes: string[] = [];
      for (const seconds of REPEATED) codes.push((await begin(AFFILIATED, seconds)).code);
      await ask(UNKNOWN, 600);
      const a = affiliates.find((x) => x.cedula === AFFILIATED)!;
      const needles = [AFFILIATED, UNKNOWN, ...codes, a.mobilePhone, a.email!];
      const columns = await pool.query<{ table_schema: string; table_name: string; column_name: string }>(
        `SELECT table_schema, table_name, column_name FROM information_schema.columns
         WHERE table_schema IN ('app', 'public') AND NOT (table_schema = 'app' AND table_name = 'captured_messages')
           AND table_name NOT LIKE '%drizzle%' AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
      );
      const hits: string[] = [];
      for (const { table_schema, table_name, column_name } of columns.rows) {
        const { rows } = await pool.query<{ v: string }>(`SELECT "${column_name}"::text AS v FROM "${table_schema}"."${table_name}" WHERE "${column_name}" IS NOT NULL`);
        for (const { v } of rows) for (const n of needles) if (v.includes(n)) hits.push(`${table_name}.${column_name}`);
      }
      expect(hits).toEqual([]);
      const control = await pool.query<{ v: string }>('SELECT cedula AS v FROM sim.affiliates');
      expect(control.rows.some(({ v }) => v.includes(AFFILIATED))).toBe(true);
    });
  });
});
