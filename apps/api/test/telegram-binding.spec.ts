import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT, type RecordedCall } from '../src/modules/telegram/telegram-transport';
import { createTestApp } from './support/app';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
  acceptNotice,
  codeIn,
  createSeedPool,
  differentCode,
  fingerprintOf,
  loadFixtureAffiliates,
  requestAndReadCode,
  resetIdentityData,
  setClockOffset,
  verifyCode,
  waitForSms,
} from './support/identity';
import { trackSends } from './support/sends';
import { A, B, NEW_CHAT, WEBHOOK, captureLogs, logSink, message, press, rowDiff, rowMap, text } from './support/telegram';

// F010 (contracts/F010.md): el chat vinculado, B-03 mínima y el vencimiento a 3 meses visto desde el chat.
// app.test_clock es global: este archivo corre en serie y lo deja en 0 (T.6). Las cadenas están escritas aquí a propósito.

const LIVE_UNO_MAR = 'Paciente vinculado: Paciente Ficticio Uno. Vinculación vigente hasta el 1 de marzo de 2027.';
const EXPIRED = 'Su vinculación venció. Para continuar necesita un código nuevo.';
const VERIFIED = 'Identidad verificada';
const CODE_USED = 'Este código ya se usó. Pida un código nuevo.';
const CEDULA_INVALID = 'Cédula inválida. Escriba entre 5 y 12 dígitos.';
const CODE_INCOMPLETE = 'Código incompleto. Escriba los 6 dígitos.';
const CODE_INCORRECT = 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.';
const CODE_EXPIRED = 'El código venció. Elija una opción para continuar.';
const ASK_NEW = 'Escriba la cédula del paciente para pedir un código nuevo.';
const PLACEHOLDER = 'Esta opción estará disponible próximamente.';
const APPROVED_START = 'Si la cédula está afiliada';

const affiliates: Array<{ cedula: string; fullName: string; mobilePhone: string; email: string | null; eps: string }> = JSON.parse(
  readFileSync(FIXTURE_AFFILIATES, 'utf8'),
);
const uno = affiliates.find((a) => a.cedula === AFFILIATED)!;
const MARGIN_S = 5;

vi.setConfig({ testTimeout: 20000 });

let app: NestExpressApplication;
let pool: Pool;
let transport: CaptureTelegramTransport;
let sends: ReturnType<typeof trackSends>;

const post = (update: unknown, secret: string | null = process.env.TELEGRAM_WEBHOOK_SECRET!) => {
  const req = request(app.getHttpServer()).post(WEBHOOK);
  return (secret === null ? req : req.set('X-Telegram-Bot-Api-Secret-Token', secret)).send(update as object);
};
const sent = () => transport.calls.filter((c) => c.method === 'sendMessage');
const sentTexts = () => sent().map((c) => c.text);
const chatRow = async (chatId: number) => (await pool.query('SELECT * FROM telegram_chats WHERE chat_id = $1', [chatId])).rows[0];
const conversation = async (chatId: number) => (await chatRow(chatId))?.conversation;
const bindings = async () => (await pool.query('SELECT * FROM app.channel_bindings ORDER BY created_at')).rows;
const bindingsOf = async (chatId: number) =>
  (
    await pool.query(
      'SELECT b.* FROM app.channel_bindings b JOIN telegram_chats t ON t.id = b.telegram_chat_id WHERE t.chat_id = $1 ORDER BY b.created_at',
      [chatId],
    )
  ).rows;
const dump = (calls: RecordedCall[] = transport.calls) => JSON.stringify(calls);

async function say(chatId: number, value: string) {
  const res = await post(text(chatId, value));
  await sends.flush();
  return res;
}
async function pressButton(chatId: number, data: string) {
  const res = await post(press(chatId, data));
  await sends.flush();
  return res;
}
async function acceptAs(chatId: number) {
  await post(message(chatId)).expect(200);
  await post(press(chatId, 'accept:holder')).expect(200);
  transport.calls.length = 0;
}
const advance = (seconds: number) => pool.query('UPDATE app.test_clock SET offset_seconds = offset_seconds + $1', [seconds]);

/** Fija el reloj en el mediodía de `date` en America/Bogota (solo hacia adelante). */
async function setClockToBogotaNoon(date: string) {
  const { rows } = await pool.query(
    `SELECT floor(EXTRACT(EPOCH FROM (($1::date + time '12:00') AT TIME ZONE 'America/Bogota' - now())))::int AS offset`,
    [date],
  );
  expect(rows[0].offset).toBeGreaterThan(0);
  await setClockOffset(pool, rows[0].offset);
}
/** Fija el reloj `seconds` segundos respecto de `expiresAt` (entero: la API no puede caer en el instante exacto). */
async function clockAt(expiresAt: Date, seconds: number) {
  const { rows } = await pool.query(
    `SELECT (CASE WHEN $2::int < 0 THEN floor(EXTRACT(EPOCH FROM ($1::timestamptz - now()))) ELSE ceil(EXTRACT(EPOCH FROM ($1::timestamptz - now()))) END)::int + $2::int AS offset`,
    [expiresAt, seconds],
  );
  await setClockOffset(pool, rows[0].offset);
}

/** Pide el código por el bot (la espera de 2 minutos se salta adelantando el reloj) y lo verifica. */
async function verifyVia(chatId: number, cedula = AFFILIATED, code?: (real: string) => string) {
  await pool.query('TRUNCATE app.captured_messages');
  const previous = await pool.query('SELECT 1 FROM app.otp_challenges WHERE cedula_fingerprint = $1', [fingerprintOf(cedula)]);
  if (previous.rowCount) await advance(120);
  if ((await conversation(chatId)).step === 'verified') await say(chatId, '/start');
  await say(chatId, cedula);
  const sms = (await waitForSms(pool))!;
  const real = codeIn(sms.body);
  await say(chatId, code ? code(real) : real);
  return real;
}
/** Chat aceptado y verificado con la cédula; deja el registro de llamadas vacío. */
async function linked(chatId = A, cedula = AFFILIATED) {
  await acceptAs(chatId);
  await verifyVia(chatId, cedula);
  expect(sentTexts().at(-1)).toBe(VERIFIED);
  transport.calls.length = 0;
}

async function cleanUp() {
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
}

beforeAll(async () => {
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
  app = await createTestApp({ logger: logSink });
  transport = app.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
  sends = trackSends(app);
});
beforeEach(async () => {
  transport.reset();
  await cleanUp();
});
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanUp();
  await app.close();
  await pool.end();
});

describe('paso 1: la vinculación se ve desde el chat', () => {
  it('1.2 tras verificar, "hola" recibe el paciente y su vencimiento (3 meses, 1 de marzo de 2027)', async () => {
    await setClockToBogotaNoon('2026-12-01');
    await linked();
    const [row] = await bindingsOf(A);
    const local = (await pool.query(`SELECT to_char($1::timestamptz AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`, [row.expires_at])).rows[0].d;
    expect(local).toBe('2027-03-01');
    await say(A, 'hola');
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([LIVE_UNO_MAR]);
  });
});

describe('paso 2: otro mensaje más tarde, sin pedir otro código', () => {
  async function setup() {
    await setClockToBogotaNoon('2026-12-01');
    await linked();
    await advance(30 * 86400);
  }

  it('2.1 a 2.3 y 2.8: cuatro textos, misma respuesta, sin filas ni cambios y sin datos de más', async () => {
    await setup();
    const beforeRows = await rowMap(pool);
    const beforeBindings = await bindings();
    const beforeConv = await conversation(A);
    const answers: string[] = [];
    for (const t of ['hola', 'gestiones', '¿Qué tengo pendiente?', '1234']) {
      transport.calls.length = 0;
      expect((await say(A, t)).status).toBe(200);
      expect(sent()).toHaveLength(1);
      expect(sent()[0].chatId).toBe(A);
      expect(sent()[0].replyMarkup).toBeUndefined();
      expect(sent()[0].keys.sort()).toEqual(['chat_id', 'text']);
      answers.push(sent()[0].text!);
      const all = dump();
      for (const secret of [uno.cedula, uno.mobilePhone, uno.email!, uno.eps]) expect(all).not.toContain(secret);
      expect(all).toContain('Paciente Ficticio Uno');
    }
    expect(new Set(answers)).toEqual(new Set([LIVE_UNO_MAR]));
    expect(rowDiff(beforeRows, await rowMap(pool))).toEqual({});
    expect(await bindings()).toEqual(beforeBindings);
    expect(await conversation(A)).toEqual(beforeConv);
    expect((await conversation(A)).step).toBe('verified');
  });

  it('2.3 control positivo: la búsqueda marca un texto con la cédula', () => {
    expect(JSON.stringify({ text: `hola ${uno.cedula}` })).toContain(uno.cedula);
  });

  it('2.4 los códigos de 6 dígitos y /start del paso verified no cambian', async () => {
    await setup();
    await say(A, '123456');
    expect(sentTexts()).toEqual([CODE_USED]);
    transport.calls.length = 0;
    await say(A, '/start');
    expect((await conversation(A)).step).toBe('awaiting_cedula');
  });

  it('2.5 foto y documento: sin respuesta, sin filas y sin cambio de conversation', async () => {
    await setup();
    const before = await rowMap(pool);
    const conv = await conversation(A);
    await post(message(A, { photo: [{ file_id: 'x', file_unique_id: 'y', width: 1, height: 1 }] })).expect(200);
    await post(message(A, { document: { file_id: 'x', file_unique_id: 'y' } })).expect(200);
    expect(transport.calls).toHaveLength(0);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(await conversation(A)).toEqual(conv);
  });

  it('2.6 el mismo update_id dos veces produce un solo mensaje', async () => {
    await setup();
    const update = text(A, 'hola');
    await post(update).expect(200);
    await post(update).expect(200);
    expect(sent()).toHaveLength(1);
  });

  it('2.7 dos pacientes en el chat: un mensaje con 2 líneas, en orden de creación', async () => {
    await setClockToBogotaNoon('2026-12-01');
    await acceptAs(A);
    await verifyVia(A, AFFILIATED);
    await verifyVia(A, AFFILIATED_NO_EMAIL);
    expect(sentTexts().at(-1)).toBe(VERIFIED);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sent()).toHaveLength(1);
    const lines = sent()[0].text!.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Paciente vinculado: Paciente Ficticio Uno\. Vinculación vigente hasta el .+\.$/);
    expect(lines[1]).toMatch(/^Paciente vinculado: Paciente Ficticio Dos\. Vinculación vigente hasta el .+\.$/);
    expect(sent()[0].replyMarkup).toBeUndefined();
  });

  it('2.9 otro chat no ve la información: uno aceptado sin verificar y uno sin aceptar', async () => {
    await linked(A);
    await acceptAs(B);
    await say(B, 'hola');
    expect(sentTexts()).toEqual([CEDULA_INVALID]);
    expect(dump()).not.toContain('Paciente Ficticio');
    transport.calls.length = 0;
    await say(NEW_CHAT, 'hola');
    expect(sent()).toHaveLength(1);
    expect(sent()[0].text).toContain('Aviso de privacidad'.slice(0, 5));
    expect(dump()).not.toContain('Paciente Ficticio');
  });
});

describe('paso 3: el vencimiento de 3 meses', () => {
  it('3.1 y 3.2: vigente un segundo antes y vencida un segundo después, sin datos y sin cambiar filas', async () => {
    await setClockToBogotaNoon('2026-12-01');
    await linked();
    const [binding] = await bindingsOf(A);
    await clockAt(binding.expires_at, -MARGIN_S);
    transport.calls.length = 0;
    const t0 = Date.now();
    await say(A, 'hola');
    expect(Date.now() - t0).toBeLessThan(MARGIN_S * 1000); // el margen de 5 s: si no, la prueba se repite
    expect(sentTexts()).toEqual([LIVE_UNO_MAR]);

    await clockAt(binding.expires_at, 1);
    transport.calls.length = 0;
    const before = await rowMap(pool);
    const conv = await conversation(A);
    await say(A, 'hola');
    expect(sent()).toHaveLength(1);
    expect(sent()[0].text).toBe(EXPIRED);
    expect(sent()[0].replyMarkup).toEqual({
      inline_keyboard: [[{ text: 'Pedir un código nuevo', callback_data: 'path:request_new_code' }], [{ text: 'Revocar mi autorización', callback_data: 'revoke' }]],
    });
    const all = dump();
    for (const secret of ['Paciente Ficticio Uno', uno.cedula, uno.mobilePhone, uno.email!, uno.eps, '1 de marzo de 2027', '2027']) {
      expect(all).not.toContain(secret);
    }
    const patientRef = (await pool.query('SELECT id FROM app.patient_refs')).rows[0].id;
    expect(all).not.toContain(patientRef);
    expect((await bindingsOf(A))[0].revoked_at).toBeNull();
    expect(await conversation(A)).toEqual(conv);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    // Control positivo: la misma búsqueda sí encuentra la fecha en el mensaje de vigente.
    expect(JSON.stringify([{ text: LIVE_UNO_MAR }])).toContain('1 de marzo de 2027');
  });

  it('3.3 el bot y GET /me usan la misma consulta listLiveBindings', async () => {
    const identity = app.get(IdentityService);
    const spy = vi.spyOn(identity, 'listLiveBindings');
    await linked();
    spy.mockClear();
    await say(A, 'hola');
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    const accepted = await acceptNotice(app);
    await pool.query('TRUNCATE app.captured_messages');
    const { challengeId, code } = await requestAndReadCode(app, pool, accepted.cookie, AFFILIATED_NO_EMAIL);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    const device = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('__Host-pe_device='))!;
    spy.mockClear();
    const me = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', device.split(';')[0]);
    expect(me.status).toBe(200);
    expect(spy).toHaveBeenCalled();
  });

  it.each([
    ['A', '2026-11-30', 'Paciente Ficticio Uno', '28 de febrero de 2027', '2027-02-28'],
    ['B', '2027-08-31', 'Paciente Ficticio Uno', '30 de noviembre de 2027', '2027-11-30'],
  ])('3.4 meses de calendario, caso %s', async (_c, day, name, label, isoDay) => {
    await setClockToBogotaNoon(day);
    await linked();
    const [binding] = await bindingsOf(A);
    const check = (
      await pool.query(
        `SELECT (expires_at = created_at + interval '3 months') AS ok, to_char(expires_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d FROM app.channel_bindings`,
      )
    ).rows[0];
    expect(check).toEqual({ ok: true, d: isoDay });
    const live = `Paciente vinculado: ${name}. Vinculación vigente hasta el ${label}.`;
    await clockAt(binding.expires_at, -MARGIN_S);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sentTexts()).toEqual([live]);
    for (const s of [1, 2]) {
      await clockAt(binding.expires_at, s);
      transport.calls.length = 0;
      await say(A, 'hola');
      expect(sentTexts()).toEqual([EXPIRED]);
    }
  });

  it('3.5 y 3.6: vencida, ningún texto ni foto muestra datos ni ofrece gestiones; solo dos botones', async () => {
    await linked();
    const [binding] = await bindingsOf(A);
    await clockAt(binding.expires_at, 1);
    transport.calls.length = 0;
    const before = await rowMap(pool);
    for (const t of ['hola', 'gestiones', '1234']) await say(A, t);
    await post(message(A, { photo: [{ file_id: 'x', file_unique_id: 'y', width: 1, height: 1 }] })).expect(200);
    await post(message(A, { document: { file_id: 'x', file_unique_id: 'y' } })).expect(200);
    expect(sentTexts()).toEqual([EXPIRED, EXPIRED, EXPIRED]);
    const all = dump();
    const year = String(binding.expires_at.getUTCFullYear());
    for (const secret of ['Paciente Ficticio Uno', uno.cedula, uno.mobilePhone, uno.email!, uno.eps, year]) expect(all).not.toContain(secret);
    const data = sent().flatMap((c) =>
      ((c.replyMarkup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard).flat().map((b) => b.callback_data),
    );
    expect(new Set(data)).toEqual(new Set(['path:request_new_code', 'revoke']));
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    // Control positivo del detector.
    expect(JSON.stringify([{ text: `x ${uno.cedula}` }])).toContain(uno.cedula);
  });

  it('3.7 y 3.8: pedir un código nuevo y revocar con la vinculación vencida', async () => {
    await linked();
    const [binding] = await bindingsOf(A);
    await clockAt(binding.expires_at, 1);
    transport.calls.length = 0;
    const pending = (await conversation(A)).pendingAcceptance;

    // 3.8 primero: revocar no crea nada ni cambia la conversación.
    const before = await rowMap(pool);
    const conv = await conversation(A);
    await pressButton(A, 'revoke');
    expect(sentTexts()).toEqual([PLACEHOLDER]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(await conversation(A)).toEqual(conv);

    transport.calls.length = 0;
    const challengesBefore = Number((await pool.query('SELECT count(*) FROM app.otp_challenges')).rows[0].count);
    await pressButton(A, 'path:request_new_code');
    expect(sentTexts()).toEqual([ASK_NEW]);
    const c = await conversation(A);
    expect(c.step).toBe('awaiting_cedula');
    expect(c.pendingAcceptance).toEqual(pending);
    expect(c.challengeId).toBeUndefined();
    await say(A, 'hola');
    expect(sentTexts().at(-1)).toBe(CEDULA_INVALID);
    await advance(120);
    await say(A, AFFILIATED);
    expect(sentTexts().at(-1)).toContain(APPROVED_START);
    expect(Number((await pool.query('SELECT count(*) FROM app.otp_challenges')).rows[0].count)).toBe(challengesBefore + 1);
    await say(A, 'hola');
    expect(sentTexts().at(-1)).toBe(CODE_INCOMPLETE);
    expect(dump()).not.toContain('Paciente Ficticio');
  });

  it('3.7 un código de 6 dígitos en verified con la vinculación vencida sigue recibiendo "ya se usó"', async () => {
    await linked();
    await clockAt((await bindingsOf(A))[0].expires_at, 1);
    transport.calls.length = 0;
    await say(A, '654321');
    expect(sentTexts()).toEqual([CODE_USED]);
  });

  it('3.9 el vencimiento es por vinculación', async () => {
    await acceptAs(A);
    await verifyVia(A, AFFILIATED);
    await advance(30 * 86400);
    await verifyVia(A, AFFILIATED_NO_EMAIL);
    expect(sentTexts().at(-1)).toBe(VERIFIED);
    const [first, second] = await bindingsOf(A);
    await clockAt(first.expires_at, 1);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sent()).toHaveLength(1);
    expect(sent()[0].text).toMatch(/^Paciente vinculado: Paciente Ficticio Dos\./);
    expect(sent()[0].text).not.toContain('Ficticio Uno');
    await clockAt(second.expires_at, 1);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sentTexts()).toEqual([EXPIRED]);
  });

  it('3.10 el vencimiento del chat no afecta al navegador del mismo paciente', async () => {
    await linked();
    await advance(30 * 86400);
    const accepted = await acceptNotice(app);
    await pool.query('TRUNCATE app.captured_messages');
    const { challengeId, code } = await requestAndReadCode(app, pool, accepted.cookie, AFFILIATED);
    const res = await verifyCode(app, accepted.cookie, { challengeId, code });
    expect(res.status).toBe(200);
    const device = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('__Host-pe_device='))!.split(';')[0];
    const [chatBinding] = await bindingsOf(A);
    await clockAt(chatBinding.expires_at, 1);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sentTexts()).toEqual([EXPIRED]);
    const me = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', device);
    expect(me.status).toBe(200);
    expect(me.body.bindings).toHaveLength(1);
  });

  it('3.11 el bot no escribe por iniciativa propia al vencer', async () => {
    await linked();
    await clockAt((await bindingsOf(A))[0].expires_at, 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(transport.calls).toHaveLength(0);
  });
});

describe('paso 4: código nuevo desde un chat vencido', () => {
  it('4.1 a 4.3: vuelve a vincular, reutiliza la aceptación y el vencimiento nuevo es a 3 meses', async () => {
    await linked();
    const [old] = await bindingsOf(A);
    await clockAt(old.expires_at, 1);
    transport.calls.length = 0;
    const pending = (await conversation(A)).pendingAcceptance;
    const consentsBefore = Number((await pool.query('SELECT count(*) FROM app.consent_records')).rows[0].count);
    await pressButton(A, 'path:request_new_code');
    const real = await verifyVia(A, AFFILIATED);
    expect(real).toMatch(/^\d{6}$/);
    expect(sentTexts().at(-1)).toBe(VERIFIED);
    const rows = await bindingsOf(A);
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1].revoked_at).toBeNull();
    expect(rows[1].expires_at.getTime()).toBeGreaterThan(old.expires_at.getTime());
    expect((await pool.query(`SELECT (expires_at = created_at + interval '3 months') AS ok FROM app.channel_bindings WHERE id = $1`, [rows[1].id])).rows[0].ok).toBe(true);
    expect(Number((await pool.query('SELECT count(*) FROM app.patient_refs')).rows[0].count)).toBe(1);
    expect(Number((await pool.query('SELECT count(*) FROM telegram_chats')).rows[0].count)).toBe(1);
    const conv = await conversation(A);
    expect(conv.step).toBe('verified');
    // 4.2
    const consents = (await pool.query(`SELECT * FROM app.consent_records WHERE channel = 'telegram' ORDER BY accepted_at`)).rows;
    expect(consents.length).toBe(consentsBefore + 1);
    expect(consents.at(-1).accepted_at.toISOString()).toBe(pending.acceptedAt);
    // 4.3
    transport.calls.length = 0;
    await clockAt(rows[1].expires_at, -MARGIN_S);
    await say(A, 'hola');
    expect(sent()[0].text).toMatch(/^Paciente vinculado: Paciente Ficticio Uno\. Vinculación vigente hasta el /);
    expect(sent()[0].text).not.toBe(LIVE_UNO_MAR);
    await clockAt(rows[1].expires_at, 1);
    transport.calls.length = 0;
    await say(A, 'hola');
    expect(sentTexts()).toEqual([EXPIRED]);
  });

  it('4.4 un código incorrecto o vencido no vuelve vigente la vinculación', async () => {
    await linked();
    const [old] = await bindingsOf(A);
    await clockAt(old.expires_at, 1);
    await pressButton(A, 'path:request_new_code');
    transport.calls.length = 0;
    await verifyVia(A, AFFILIATED, differentCode);
    expect(sentTexts().at(-1)).toBe(CODE_INCORRECT);
    const challenge = (await pool.query('SELECT attempts_used FROM app.otp_challenges ORDER BY created_at DESC LIMIT 1')).rows[0];
    expect(challenge.attempts_used).toBe(1);
    expect(await bindingsOf(A)).toHaveLength(1);
    // Código correcto pero pasados 10 minutos.
    const sms = (await waitForSms(pool))!;
    await advance(11 * 60);
    transport.calls.length = 0;
    await say(A, codeIn(sms.body));
    expect(sentTexts()).toEqual([CODE_EXPIRED]);
    expect(await bindingsOf(A)).toHaveLength(1);
    expect((await bindingsOf(A))[0].revoked_at).toBeNull();
    await say(A, 'hola');
    expect(sentTexts().at(-1)).toBe(CODE_INCOMPLETE);
  });
});

describe('transversales y registros', () => {
  it('T.2 sin secreto: 401 sin efectos para un texto de un chat vinculado', async () => {
    await linked();
    const before = await rowMap(pool);
    const conv = await conversation(A);
    const res = await post(text(A, 'hola'), null);
    expect(res.status).toBe(401);
    expect(transport.calls).toHaveLength(0);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(await conversation(A)).toEqual(conv);
  });

  it('T.3 con el transporte caído responde 200, no cambia filas y no registra el contenido', async () => {
    await linked();
    const [binding] = await bindingsOf(A);
    for (const expired of [false, true]) {
      if (expired) await clockAt(binding.expires_at, 1);
      transport.failWith('server', 'falla simulada con 3000000001');
      const before = await rowMap(pool);
      const logs = await captureLogs(async () => {
        expect((await say(A, 'hola')).status).toBe(200);
      });
      transport.clearFailure();
      expect(rowDiff(before, await rowMap(pool))).toEqual({});
      expect(logs).not.toContain('Paciente');
      expect(logs).not.toContain('Su vinculación');
      expect(logs).not.toContain('3000000001');
    }
  });

  it('R.1 y R.2: logs sin datos y conversation con solo las claves permitidas', async () => {
    const logs = await captureLogs(async () => {
      await acceptAs(A);
      await verifyVia(A);
      await say(A, 'hola');
      await clockAt((await bindingsOf(A))[0].expires_at, 1);
      await say(A, 'hola');
      await pressButton(A, 'revoke');
      await pressButton(A, 'path:request_new_code');
    });
    const joined = logs;
    expect(joined).not.toMatch(/\b\d{5,}\b/);
    for (const secret of [uno.cedula, uno.mobilePhone, uno.email!, 'Paciente Ficticio Uno', String(A), process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_WEBHOOK_SECRET!]) {
      expect(joined).not.toContain(secret);
    }
    // Control positivo del detector.
    expect(/\b\d{5,}\b/.test(`línea con ${uno.cedula}`)).toBe(true);
    const conv = await conversation(A);
    expect(Object.keys(conv).every((k) => ['step', 'challengeId', 'lastChallengeId', 'pendingAcceptance'].includes(k))).toBe(true);
    const flat = JSON.stringify(conv);
    for (const secret of ['Paciente', uno.cedula, uno.mobilePhone, uno.email!, 'prueba_uno', 'Prueba Uno', 'expires']) expect(flat).not.toContain(secret);
  });
});
