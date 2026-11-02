import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALLBACKS, EXIT_PATH_CALLBACKS } from '../src/modules/telegram/texts.js';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT, type RecordedCall } from '../src/modules/telegram/telegram-transport.js';
import { createTestApp } from './support/app.js';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
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
  type CapturedMessage,
} from './support/identity.js';
import { trackSends } from './support/sends.js';
import { A, B, NEW_CHAT, WEBHOOK, captureLogs, logSink, message, nextUpdateId, press, rowDiff, rowMap, text } from './support/telegram.js';

// F006: vencimiento, bloqueo y límites del código en el bot, con los tres caminos de salida (contracts/F006.md).
// PostgreSQL real, Telegram, SMS y correo en modo capture. Las cadenas están escritas aquí a propósito: la prueba no las toma del código.

vi.setConfig({ testTimeout: 120000 });

const APPROVED =
  'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.';
const ASK_CEDULA = 'Gracias. Escriba la cédula del paciente. La cédula se usa solo para verificar la identidad y atender la solicitud.';
const VERIFIED = 'Identidad verificada';
const CODE_INCORRECT = 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.';
const CODE_USED = 'Este código ya se usó. Pida un código nuevo.';
const CEDULA_INVALID = 'Cédula inválida. Escriba entre 5 y 12 dígitos.';
const CODE_INCOMPLETE = 'Código incompleto. Escriba los 6 dígitos.';
const CODE_NOT_SENT = 'No pudimos enviar el código. Intente de nuevo.';
const EXPIRED = 'El código venció. Elija una opción para continuar.';
const EXHAUSTED = 'Se agotaron los intentos. Elija una opción para continuar.';
const ASK_NEW = 'Escriba la cédula del paciente para pedir un código nuevo.';
const EPS =
  'El celular y el correo se cambian en su EPS (Salud Total o Sanitas), no en Pharma Express. Comuníquese con su EPS para actualizar sus datos y luego pida un código nuevo.';
const IN_PERSON = 'Puede acudir a la atención presencial en un punto de Disfarma en Manizales.';
const TOO_SOON = 'Ya enviamos un código hace poco. Espere 2 minutos para pedir uno nuevo.';
const HOURLY = 'Alcanzó el límite de códigos por hora. Intente más tarde o acuda a la atención presencial.';
const LABELS = ['Pedir un código nuevo', 'Actualizar mis datos en la EPS', 'Acudir a la atención presencial'];
const PATH_NEW = 'path:request_new_code';
const PATH_EPS = 'path:update_data_at_eps';
const PATH_PRESENCIAL = 'path:in_person_service';
const FORBIDDEN = ['Medicamento Ficticio A', 'Medicamento Ficticio B', 'Medicamento Ficticio C', 'Diagnóstico Ficticio X', 'Diagnóstico Ficticio Y'];
const PROTECTED = ['app.consent_records', 'app.patient_refs', 'app.channel_bindings', 'app.browser_devices'];

const affiliates: Array<{ cedula: string; fullName: string; mobilePhone: string; email: string | null }> = JSON.parse(
  readFileSync(FIXTURE_AFFILIATES, 'utf8'),
);
const affiliate = (cedula: string) => affiliates.find((a) => a.cedula === cedula)!;

let app: NestExpressApplication;
let pool: Pool;
let transport: CaptureTelegramTransport;
let sends: ReturnType<typeof trackSends>;
/** Mensajes de SMS y correo vistos por los pedidos de la prueba en curso. */
let allCaptured: CapturedMessage[] = [];

const post = (update: unknown, secret: string | null = process.env.TELEGRAM_WEBHOOK_SECRET!) => {
  const req = request(app.getHttpServer()).post(WEBHOOK);
  return (secret === null ? req : req.set('X-Telegram-Bot-Api-Secret-Token', secret)).send(update as object);
};
const sent = () => transport.calls.filter((c) => c.method === 'sendMessage');
const sentTexts = () => sent().map((c) => c.text);
const count = (method: string) => transport.calls.filter((c) => c.method === method).length;
const clearCalls = () => void (transport.calls.length = 0);
const chatRow = async (chatId: number) => (await pool.query('SELECT * FROM telegram_chats WHERE chat_id = $1', [chatId])).rows[0];
const conversation = async (chatId: number) => (await chatRow(chatId))?.conversation;
const challengeRow = async (id: string) => (await pool.query('SELECT * FROM app.otp_challenges WHERE id = $1', [id])).rows[0];
const challenges = async (cedula = AFFILIATED) =>
  (await pool.query('SELECT * FROM app.otp_challenges WHERE cedula_fingerprint = $1 ORDER BY created_at', [fingerprintOf(cedula)])).rows;
const at = (seconds: number) => setClockOffset(pool, seconds);
const protectedChanges = (before: Record<string, number>, after: Record<string, number>) =>
  Object.keys(rowDiff(before, after)).filter((t) => PROTECTED.includes(t));
const affiliatesDump = async () => (await pool.query('SELECT * FROM sim.affiliates ORDER BY cedula')).rows;
const bindings = async () => (await pool.query('SELECT * FROM app.channel_bindings ORDER BY id')).rows;

/** Función de aplanado escrita en la prueba (criterio 3.1): de arriba abajo y de izquierda a derecha. */
type Button = { text: string; callback_data?: string };
const flatten = (rows: Button[][]): Button[] => rows.flat();
const buttonsOf = (call: RecordedCall) => flatten((call.replyMarkup as { inline_keyboard: Button[][] }).inline_keyboard);
function expectThreeButtons(call: RecordedCall) {
  const buttons = buttonsOf(call);
  expect(buttons).toHaveLength(3);
  expect(buttons.map((b) => b.text)).toEqual(LABELS);
  const data = buttons.map((b) => b.callback_data!);
  expect(data).toEqual([PATH_NEW, PATH_EPS, PATH_PRESENCIAL]);
  expect(new Set(data).size).toBe(3);
  for (const d of data) {
    expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
    expect(d).not.toMatch(/\d{3,}/);
  }
}

async function acceptAs(chatId: number) {
  await post(message(chatId)).expect(200);
  await post(press(chatId, 'accept:holder')).expect(200);
  clearCalls();
}
async function say(chatId: number, value: string) {
  const res = await post(text(chatId, value));
  await sends.flush();
  return res;
}
async function push(chatId: number, data: string, extra: Record<string, unknown> = {}) {
  const res = await post({ ...press(chatId, data), ...extra });
  await sends.flush();
  return res;
}
/** `/start` o el botón "Pedir un código nuevo": vuelven a pedir la cédula. */
const restart = (chatId: number, how: 'start' | 'button' = 'start') =>
  how === 'start' ? post(message(chatId)).expect(200) : push(chatId, PATH_NEW);
/**
 * Pide el código por el bot con el reloj en `seconds` (si se indica) y devuelve el código del SMS y el reto.
 * Deja el registro de llamadas vacío salvo con `keep`.
 */
async function ask(chatId: number, cedula = AFFILIATED, seconds?: number, keep = false) {
  if (seconds !== undefined) await at(seconds);
  await pool.query('TRUNCATE app.captured_messages');
  await say(chatId, cedula);
  const hasSms = affiliates.some((a) => a.cedula === cedula);
  const sms = hasSms ? await waitForSms(pool) : undefined;
  allCaptured.push(...(await capturedMessages(pool)));
  const challengeId = (await conversation(chatId))?.challengeId as string | undefined;
  if (!keep) clearCalls();
  return { code: sms ? codeIn(sms.body) : '', challengeId: challengeId ?? '' };
}
/** Pide con `/start` y la cédula; devuelve lo que el bot respondió a la cédula. */
async function askAfterRestart(chatId: number, how: 'start' | 'button', cedula: string, seconds?: number) {
  if (seconds !== undefined) await at(seconds);
  await restart(chatId, how);
  clearCalls();
  return ask(chatId, cedula, undefined, true);
}
/** Tres códigos incorrectos distintos del real, enviados por el webhook. */
async function exhaust(chatId: number, code: string) {
  const wrong = [differentCode(code)];
  wrong.push(differentCode(wrong[0]));
  wrong.push(differentCode(wrong[1]));
  for (const w of wrong) await say(chatId, w);
}
const quiet = async (before: number, ms = 3000) => {
  await new Promise((r) => setTimeout(r, ms));
  expect((await capturedMessages(pool)).length).toBe(before);
};

async function cleanUp() {
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
  allCaptured = [];
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
// T.6: toda prueba que mueve app.test_clock lo restablece a 0 y borra los retos que creó.
afterEach(async () => {
  await sends.flush();
  transport.clearFailure();
  await setClockOffset(pool, 0);
  await cleanUp();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanUp();
  await app.close();
  await pool.end();
});

describe('paso 1: código enviado después de 10 minutos, aunque sea correcto', () => {
  it('1.1 con el reloj en 601 el código real recibe el mensaje de vencido con los tres botones y no vincula nada', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await at(601);
    const before = await rowMap(pool);
    const res = await say(A, code);
    expect(res.status).toBe(200);
    expect(sentTexts()).toEqual([EXPIRED]);
    expectThreeButtons(sent()[0]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    expect(protectedChanges(before, await rowMap(pool))).toEqual([]);
    expect((await challengeRow(challengeId)).consumed_at).toBeNull();
    expect((await conversation(A)).step).toBe('awaiting_code');
  });

  it('1.2 borde: con 590 el código real se acepta', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await at(590);
    await say(A, code);
    expect(sentTexts()).toEqual([VERIFIED]);
    expect((await conversation(A)).step).toBe('verified');
  });

  it('1.2 borde: con 600 el código real se rechaza con el mensaje de vencido', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await at(600);
    await say(A, code);
    expect(sentTexts()).toEqual([EXPIRED]);
    expect((await conversation(A)).step).toBe('awaiting_code');
  });

  it('1.3 un código vencido no suma intento: el real y uno incorrecto reciben el mensaje de vencido', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await at(601);
    await say(A, code);
    await say(A, differentCode(code));
    expect(sentTexts()).toEqual([EXPIRED, EXPIRED]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(0);
  });

  it('1.4 precedencia: con 3 intentos usados y el reloj en 601 gana el vencimiento y los intentos siguen en 3', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await exhaust(A, code);
    expect((await challengeRow(challengeId)).attempts_used).toBe(3);
    await at(601);
    clearCalls();
    await say(A, code);
    expect(sentTexts()).toEqual([EXPIRED]);
    expectThreeButtons(sent()[0]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(3);
  });

  it('1.5 el webhook responde 200, se envía 1 mensaje por actualización y ninguna llamada contiene datos del paciente', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await at(601);
    const res = await say(A, code);
    expect(res.status).toBe(200);
    expect(sent()).toHaveLength(1);
    const a = affiliate(AFFILIATED);
    const dump = JSON.stringify(transport.calls);
    for (const needle of [AFFILIATED, a.mobilePhone, a.email!, code]) expect(dump).not.toContain(needle);
  });
});

describe('paso 2: tres códigos erróneos y luego el correcto, rechazado', () => {
  it('2.1 los dos primeros errores dicen "no es correcto" sin botones y el tercero, agotado con los tres botones', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    const wrong1 = differentCode(code);
    const wrong2 = differentCode(wrong1);
    const wrong3 = differentCode(wrong2);
    await say(A, wrong1);
    await say(A, wrong2);
    expect(sentTexts()).toEqual([CODE_INCORRECT, CODE_INCORRECT]);
    expect(sent().every((c) => c.replyMarkup === undefined)).toBe(true);
    clearCalls();
    await say(A, wrong3);
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([EXHAUSTED]);
    expectThreeButtons(sent()[0]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(3);
  });

  it('2.2 el cuarto envío, con el código correcto, recibe agotado y no vincula nada', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await exhaust(A, code);
    clearCalls();
    const before = await rowMap(pool);
    await say(A, code);
    expect(sentTexts()).toEqual([EXHAUSTED]);
    expectThreeButtons(sent()[0]);
    expect(protectedChanges(before, await rowMap(pool))).toEqual([]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    const row = await challengeRow(challengeId);
    expect(row.consumed_at).toBeNull();
    expect(row.attempts_used).toBe(3);
    expect((await conversation(A)).step).toBe('awaiting_code');
  });

  it('2.3 un quinto envío con otro código incorrecto recibe también el mensaje de agotado', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await exhaust(A, code);
    await say(A, code);
    clearCalls();
    await say(A, differentCode(differentCode(differentCode(differentCode(code)))));
    expect(sentTexts()).toEqual([EXHAUSTED]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(3);
  });

  it('2.4 control: dos errores y luego el código correcto verifican la identidad', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await say(A, differentCode(code));
    await say(A, differentCode(differentCode(code)));
    clearCalls();
    await say(A, code);
    expect(sentTexts()).toEqual([VERIFIED]);
    expect((await conversation(A)).step).toBe('verified');
  });

  it('2.5 un texto sin 6 dígitos recibe "Código incompleto" y no cuenta intento, antes ni después del agotamiento', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await say(A, '12345');
    expect(sentTexts()).toEqual([CODE_INCOMPLETE]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(0);
    await exhaust(A, code);
    clearCalls();
    await say(A, '12345');
    expect(sentTexts()).toEqual([CODE_INCOMPLETE]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(3);
  });

  it('2.6 cinco envíos simultáneos con códigos incorrectos: 2 "no es correcto", 3 de agotado y 3 intentos (10 vueltas)', async () => {
    for (let round = 1; round <= 10; round++) {
      await at(0);
      await cleanUp();
      transport.reset();
      await acceptAs(A);
      const { code, challengeId } = await ask(A);
      let wrong = code;
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        wrong = differentCode(wrong);
        codes.push(wrong);
      }
      const results = await Promise.all(codes.map((c) => post(text(A, c))));
      await sends.flush();
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const texts = sentTexts();
      expect(texts.filter((t) => t === CODE_INCORRECT), `vuelta ${round}`).toHaveLength(2);
      expect(texts.filter((t) => t === EXHAUSTED), `vuelta ${round}`).toHaveLength(3);
      for (const call of sent().filter((c) => c.text === EXHAUSTED)) expectThreeButtons(call);
      expect((await challengeRow(challengeId)).attempts_used, `vuelta ${round}`).toBe(3);
    }
  });
});

describe('paso 3: los tres caminos, con orientación que no cambia datos', () => {
  async function exhausted() {
    await acceptAs(A);
    const reto = await ask(A);
    await exhaust(A, reto.code);
    clearCalls();
    return reto;
  }

  it('3.1 vencido y agotado llevan exactamente 3 botones, en orden, con callback_data distinto y corto', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await at(601);
    await say(A, code);
    expectThreeButtons(sent()[0]);
    expect(sentTexts()).toEqual([EXPIRED]);
    await at(0);
    await cleanUp();
    transport.reset();
    await acceptAs(A);
    const second = await ask(A);
    await exhaust(A, second.code);
    expect(sentTexts().at(-1)).toBe(EXHAUSTED);
    expectThreeButtons(sent().at(-1)!);
  });

  it.each([
    ['vencido', 601],
    ['agotado', 120],
  ] as const)('3.2 "Pedir un código nuevo" (%s): pide la cédula, no consume el reto y luego la cédula crea uno nuevo', async (kind, seconds) => {
    await acceptAs(A);
    const first = await ask(A);
    if (kind === 'vencido') await at(601);
    else {
      await exhaust(A, first.code);
      await at(0);
    }
    clearCalls();
    const pending = (await conversation(A)).pendingAcceptance;
    await push(A, PATH_NEW);
    expect(sentTexts()).toEqual([ASK_NEW]);
    expect(sent()).toHaveLength(1);
    const conv = await conversation(A);
    expect(conv).toEqual({ step: 'awaiting_cedula', pendingAcceptance: pending });
    expect(conv.challengeId).toBeUndefined();
    const old = await challengeRow(first.challengeId);
    expect(old.consumed_at).toBeNull();
    expect(old.superseded_at).toBeNull();
    clearCalls();
    await at(seconds);
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([APPROVED]);
    const after = await conversation(A);
    expect(after.step).toBe('awaiting_code');
    expect(after.challengeId).not.toBe(first.challengeId);
    expect(await challenges()).toHaveLength(2);
  });

  it('3.3 "Actualizar mis datos en la EPS": 1 mensaje sin teclado y no cambia nada', async () => {
    await exhausted();
    const rowBefore = await chatRow(A);
    const before = await rowMap(pool);
    const messages = (await capturedMessages(pool)).length;
    await push(A, PATH_EPS);
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([EPS]);
    expect(sent()[0].replyMarkup).toBeUndefined();
    expect(await chatRow(A)).toEqual(rowBefore);
    expect(await rowMap(pool)).toEqual(before);
    expect((await capturedMessages(pool)).length).toBe(messages);
  });

  it('3.4 "Acudir a la atención presencial": 1 mensaje sin teclado y no cambia nada', async () => {
    await exhausted();
    const rowBefore = await chatRow(A);
    const before = await rowMap(pool);
    await push(A, PATH_PRESENCIAL);
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([IN_PERSON]);
    expect(sent()[0].replyMarkup).toBeUndefined();
    expect(await chatRow(A)).toEqual(rowBefore);
    expect(await rowMap(pool)).toEqual(before);
  });

  it('3.5 los botones se pueden pulsar de nuevo y responden igual; (a) en awaiting_cedula no duplica nada', async () => {
    await exhausted();
    const before = await rowMap(pool);
    for (let i = 0; i < 2; i++) {
      clearCalls();
      await push(A, PATH_EPS);
      expect(sentTexts()).toEqual([EPS]);
      clearCalls();
      await push(A, PATH_PRESENCIAL);
      expect(sentTexts()).toEqual([IN_PERSON]);
    }
    expect(await rowMap(pool)).toEqual(before);
    clearCalls();
    await push(A, PATH_NEW);
    expect(sentTexts()).toEqual([ASK_NEW]);
    const afterFirst = await rowMap(pool);
    clearCalls();
    await push(A, PATH_NEW);
    expect(sentTexts()).toEqual([ASK_NEW]);
    expect((await conversation(A)).step).toBe('awaiting_cedula');
    expect(await rowMap(pool)).toEqual(afterFirst);
    expect(await challenges()).toHaveLength(1);
  });

  it('3.6 un chat que no aceptó no recibe nada ni crea nada, y otro chat no cambia la fila del primero', async () => {
    await exhausted();
    clearCalls();
    const before = await rowMap(pool);
    for (const data of [PATH_NEW, PATH_EPS, PATH_PRESENCIAL]) await push(NEW_CHAT, data);
    expect(transport.calls).toEqual([]);
    expect(await rowMap(pool)).toEqual(before);
    expect(await chatRow(NEW_CHAT)).toBeUndefined();
    // Un segundo chat que sí aceptó actúa solo sobre su propia fila.
    await acceptAs(B);
    const rowA = await chatRow(A);
    await push(B, PATH_NEW);
    expect(sentTexts()).toEqual([ASK_NEW]);
    expect(sent()[0].chatId).toBe(B);
    expect(await chatRow(A)).toEqual(rowA);
    clearCalls();
    await push(B, PATH_EPS);
    expect(sentTexts()).toEqual([EPS]);
    expect(await chatRow(A)).toEqual(rowA);
  });

  it('3.7 en verified los botones de un mensaje viejo no deshacen la vinculación', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await say(A, code);
    clearCalls();
    const convBefore = await conversation(A);
    const bindingsBefore = await bindings();
    expect(convBefore.step).toBe('verified');
    for (const [data, expected] of [[PATH_EPS, EPS], [PATH_PRESENCIAL, IN_PERSON]] as const) {
      const rowBefore = await chatRow(A);
      await push(A, data);
      expect(sentTexts().at(-1)).toBe(expected);
      expect(await chatRow(A)).toEqual(rowBefore);
      expect(await bindings()).toEqual(bindingsBefore);
    }
    clearCalls();
    await push(A, PATH_NEW);
    expect(sentTexts()).toEqual([ASK_NEW]);
    const convAfter = await conversation(A);
    expect(convAfter.step).toBe('awaiting_cedula');
    expect(convAfter.pendingAcceptance).toEqual(convBefore.pendingAcceptance);
    expect(await bindings()).toEqual(bindingsBefore);
  });

  it('3.8 la orientación indica que el cambio se hace en la EPS y no trae botones', async () => {
    await exhausted();
    await push(A, PATH_EPS);
    expect(sent()[0].text).toContain('se cambian en su EPS');
    expect(sent()[0].replyMarkup).toBeUndefined();
    expect(sent()[0].keys.sort()).toEqual(['chat_id', 'text']);
  });

  it('3.9 los textos que piden cambiar el celular o el correo no modifican nada y no abren un camino de cambio', async () => {
    const typed = ['cambiar mi celular', 'mi correo es otro@example.invalid', '/celular', '/correo'];
    const allowed = new Set([CODE_INCOMPLETE, CEDULA_INVALID]);
    // F010: en verified un texto libre recibe B-03 (el paciente y su vencimiento); sigue sin tocar nada ni abrir un camino de cambio.
    const BOUND = /^Paciente vinculado: Paciente Ficticio Uno\. Vinculación vigente hasta el \d{1,2} de [a-z]+ de \d{4}\.$/;
    const run = async () => {
      const affBefore = await affiliatesDump();
      const before = await rowMap(pool);
      const messages = (await capturedMessages(pool)).length;
      clearCalls();
      for (const value of typed) await say(A, value);
      expect(sentTexts().every((t) => allowed.has(t!) || BOUND.test(t!))).toBe(true);
      expect(await affiliatesDump()).toEqual(affBefore);
      expect(await rowMap(pool)).toEqual(before);
      expect((await capturedMessages(pool)).length).toBe(messages);
    };
    await acceptAs(A);
    await run(); // awaiting_cedula
    const { code } = await ask(A);
    await run(); // awaiting_code
    expect((await challengeRow((await conversation(A)).challengeId)).attempts_used).toBe(0);
    await say(A, code);
    expect((await conversation(A)).step).toBe('verified');
    await run(); // verified
    const sensitive = /celular|tel[eé]fono|correo|e-?mail|phone|contact/i;
    const registered = [...Object.values(CALLBACKS), ...Object.values(EXIT_PATH_CALLBACKS)];
    expect(registered.length).toBeGreaterThanOrEqual(7);
    expect(registered.filter((d) => sensitive.test(d))).toEqual([]);
    expect(['change_phone'].filter((d) => sensitive.test(d))).toEqual(['change_phone']);
  });

  /** Recorre todos los casos de la funcionalidad y devuelve los textos enviados por el bot. */
  async function fullFlow(): Promise<string[]> {
    await acceptAs(A);
    const first = await ask(A, AFFILIATED, 0, true);
    await at(601);
    await say(A, first.code); // vencido
    await push(A, PATH_EPS);
    await push(A, PATH_PRESENCIAL);
    await push(A, PATH_NEW);
    await say(A, AFFILIATED); // aprobado (reto 2)
    await post(message(A));
    await say(A, AFFILIATED); // espera de 2 minutos
    await post(message(A));
    await ask(A, AFFILIATED, 721, true); // reto 3
    await exhaust(A, '000000'); // agotado en el reto 3
    await post(message(A));
    await ask(A, AFFILIATED, 841, true); // reto 4
    await post(message(A));
    await ask(A, AFFILIATED, 961, true); // reto 5
    await post(message(A));
    await at(1081);
    await say(A, AFFILIATED); // límite por hora
    return sentTexts() as string[];
  }

  it('3.10 ningún mensaje del bot de esta funcionalidad lleva enlaces, teléfonos, medicamentos ni diagnósticos', async () => {
    const forbiddenIn = (value: string) =>
      FORBIDDEN.filter((f) => value.includes(f)).concat(
        /https?:\/\/|www\.|t\.me|\.com\b|\.co\b/i.test(value) ? ['enlace'] : [],
        /\+?\d[\d\s-]{6,}\d/.test(value) ? ['teléfono'] : [],
      );
    expect(forbiddenIn('Visite https://ejemplo.invalid')).toEqual(['enlace']);
    expect(forbiddenIn('Llame al 3001234567')).toEqual(['teléfono']);
    expect(forbiddenIn('Medicamento Ficticio A')).toEqual(['Medicamento Ficticio A']);
    const texts = await fullFlow();
    for (const t of [EXPIRED, EXHAUSTED, EPS, IN_PERSON, TOO_SOON, HOURLY, ASK_NEW]) expect(texts).toContain(t);
    expect(texts.flatMap((t) => forbiddenIn(t))).toEqual([]);
  });

  it('3.11 cada pulsación en un chat con fila produce exactamente 1 answerCallbackQuery sin texto', async () => {
    await exhausted();
    for (const data of [PATH_NEW, PATH_EPS, PATH_PRESENCIAL, PATH_EPS, PATH_NEW]) {
      clearCalls();
      const updateId = nextUpdateId();
      await post({ ...press(A, data, updateId) });
      const answers = transport.calls.filter((c) => c.method === 'answerCallbackQuery');
      expect(answers).toHaveLength(1);
      expect(answers[0].callbackQueryId).toBe(`cb-${updateId}`);
      expect(answers[0].keys).not.toContain('text');
      expect(answers[0].keys).not.toContain('show_alert');
      expect(sent()).toHaveLength(1);
    }
    // Un callback_data desconocido en un chat con fila no envía mensajes ni cambia nada.
    clearCalls();
    const before = await rowMap(pool);
    const rowBefore = await chatRow(A);
    await push(A, 'path:desconocido');
    expect(sent()).toHaveLength(0);
    expect(await rowMap(pool)).toEqual(before);
    expect(await chatRow(A)).toEqual(rowBefore);
    // Desde un chat sin fila no se llama a ningún método.
    clearCalls();
    for (const data of [PATH_NEW, PATH_EPS, PATH_PRESENCIAL, 'path:desconocido']) await push(NEW_CHAT, data);
    expect(transport.calls).toEqual([]);
  });
});

describe('paso 4: pedir un código nuevo antes de 2 minutos se rechaza', () => {
  it('4.1 el segundo pedido inmediato recibe el mensaje de espera, sin reto nuevo ni envíos', async () => {
    await acceptAs(A);
    await ask(A);
    await restart(A);
    clearCalls();
    const messages = (await capturedMessages(pool)).length;
    const res = await say(A, AFFILIATED);
    expect(res.status).toBe(200);
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([TOO_SOON]);
    expect(sent()[0].replyMarkup).toBeUndefined();
    const rows = await challenges();
    expect(rows).toHaveLength(1);
    expect(rows[0].superseded_at).toBeNull();
    await quiet(messages);
    expect((await conversation(A)).step).toBe('awaiting_cedula');
  });

  it('4.2 borde: con 115 se rechaza y con 120 se atiende', async () => {
    await acceptAs(A);
    await ask(A, AFFILIATED, 0);
    await at(115);
    await restart(A);
    clearCalls();
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([TOO_SOON]);
    await at(120);
    clearCalls();
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([APPROVED]);
    expect(await challenges()).toHaveLength(2);
  });

  it('4.3 una cédula inexistente recibe el mismo mensaje de espera que la afiliada', async () => {
    const run = async (cedula: string) => {
      await cleanUp();
      transport.reset();
      await at(0);
      await acceptAs(A);
      await ask(A, cedula);
      await restart(A);
      clearCalls();
      await say(A, cedula);
      return sentTexts();
    };
    const affiliated = await run(AFFILIATED);
    const unknown = await run(UNKNOWN);
    expect(affiliated).toEqual([TOO_SOON]);
    expect(unknown).toEqual([TOO_SOON]);
  });

  it('4.4 el código del primer pedido sigue sirviendo y dos chats simultáneos producen un aprobado y uno de espera (10 vueltas)', async () => {
    await acceptAs(A);
    const first = await ask(A);
    await restart(A);
    await say(A, AFFILIATED);
    expect((await challenges())).toHaveLength(1);
    // El chat sigue en awaiting_cedula; el código del primer pedido se verifica con su challengeId por la API.
    const accepted: Accepted = await acceptNotice(app, 'third_party');
    expect((await verifyCode(app, accepted.cookie, { challengeId: first.challengeId, code: first.code })).status).toBe(200);
    for (let round = 1; round <= 10; round++) {
      await at(0);
      await cleanUp();
      transport.reset();
      await acceptAs(A);
      await acceptAs(B);
      const results = await Promise.all([post(text(A, AFFILIATED)), post(text(B, AFFILIATED))]);
      await sends.flush();
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const texts = sentTexts().slice().sort();
      expect(texts, `vuelta ${round}`).toEqual([APPROVED, TOO_SOON].sort());
      expect(await challenges(), `vuelta ${round}`).toHaveLength(1);
    }
  });
});

describe('paso 5: pedir uno nuevo anula el anterior', () => {
  it('5.1 pedido por el bot (A) y luego por la API (B): el código de A recibe "ya se usó" sin botones', async () => {
    await acceptAs(A);
    const first = await ask(A);
    await at(120);
    const accepted = await acceptNotice(app, 'third_party');
    const res = await requestCode(app, accepted.cookie, AFFILIATED);
    await sends.flush();
    expect(res.status).toBe(202);
    const rows = await challenges();
    expect(rows).toHaveLength(2);
    expect(rows[0].superseded_at).not.toBeNull();
    expect(rows[1].superseded_at).toBeNull();
    expect((await conversation(A)).challengeId).toBe(first.challengeId);
    clearCalls();
    const before = await rowMap(pool);
    await say(A, first.code);
    expect(sentTexts()).toEqual([CODE_USED]);
    expect(sent()[0].replyMarkup).toBeUndefined();
    expect(rowDiff(before, await rowMap(pool))).toEqual({});
    const row = await challengeRow(first.challengeId);
    expect(row.consumed_at).toBeNull();
    expect(row.attempts_used).toBe(0);
  });

  it.each(['start', 'button'] as const)('5.2 pedido por el bot, otro después con %s: el anterior queda anulado y el nuevo se acepta', async (how) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await at(0);
      await cleanUp();
      transport.reset();
      await acceptAs(A);
      const a = await ask(A, AFFILIATED, 0);
      const b = await askAfterRestart(A, how, AFFILIATED, 120);
      if (a.code === b.code) continue; // el hash incluye el challengeId: se repite si los dos códigos coinciden
      const rows = await challenges();
      expect(rows).toHaveLength(2);
      expect((await challengeRow(a.challengeId)).superseded_at).not.toBeNull();
      expect((await conversation(A)).challengeId).toBe(b.challengeId);
      clearCalls();
      await say(A, a.code);
      expect(sentTexts()).toEqual([CODE_INCORRECT]);
      expect((await challengeRow(b.challengeId)).attempts_used).toBe(1);
      clearCalls();
      const before = await rowMap(pool);
      await say(A, b.code);
      expect(sentTexts()).toEqual([VERIFIED]);
      expect(rowDiff(before, await rowMap(pool))).toMatchObject({
        'app.patient_refs': 1,
        'app.consent_records': 1,
        'app.channel_bindings': 1,
      });
      return;
    }
    throw new Error('Los códigos coincidieron en tres intentos seguidos');
  });

  it('5.3 un reto vigente de propósito revoke queda anulado al pedir un código por el bot', async () => {
    await acceptAs(A);
    await pool.query(
      `INSERT INTO app.otp_challenges (cedula_fingerprint, purpose, expires_at, created_at)
       VALUES ($1, 'revoke', app.clock_now() + interval '10 minutes', app.clock_now() - interval '30 minutes')`,
      [fingerprintOf(AFFILIATED)],
    );
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([APPROVED]);
    const rows = await pool.query("SELECT superseded_at FROM app.otp_challenges WHERE purpose = 'revoke'");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].superseded_at).not.toBeNull();
  });
});

describe('paso 6: máximo 5 códigos por hora por cédula', () => {
  const REPEATED = [0, 120, 240, 360, 480];
  /** Cinco pedidos por el bot, alternando `/start` y el botón. Devuelve los códigos y retos. */
  async function fiveAsks(chatId: number, cedula = AFFILIATED) {
    const out: Array<{ code: string; challengeId: string }> = [];
    for (const [i, seconds] of REPEATED.entries()) {
      const how = i % 2 === 0 ? 'start' : 'button';
      await at(seconds);
      await restart(chatId, how);
      clearCalls();
      out.push(await ask(chatId, cedula, undefined, true));
      expect(sentTexts(), `pedido ${i + 1}`).toEqual([APPROVED]);
      clearCalls();
    }
    return out;
  }

  it('6.1 el sexto pedido se rechaza con el mensaje de límite y el quinto reto sigue vigente', async () => {
    await acceptAs(A);
    const codes = await fiveAsks(A);
    await at(600);
    await restart(A, 'button');
    clearCalls();
    const messages = (await capturedMessages(pool)).length;
    const res = await say(A, AFFILIATED);
    expect(res.status).toBe(200);
    expect(sent()).toHaveLength(1);
    expect(sentTexts()).toEqual([HOURLY]);
    expect(sent()[0].replyMarkup).toBeUndefined();
    expect(await challenges()).toHaveLength(5);
    await quiet(messages);
    const accepted = await acceptNotice(app, 'third_party');
    const fifth = codes[4];
    expect((await verifyCode(app, accepted.cookie, { challengeId: fifth.challengeId, code: fifth.code })).status).toBe(200);
  });

  it('6.2 borde de la ventana: con 3590 se rechaza y con 3601 se atiende', async () => {
    await acceptAs(A);
    await fiveAsks(A);
    await at(3590);
    await restart(A);
    clearCalls();
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([HOURLY]);
    await at(3601);
    clearCalls();
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([APPROVED]);
  });

  it('6.3 el límite es por cédula, no por chat, y cuentan los pedidos de la API', async () => {
    await acceptAs(A);
    await acceptAs(B);
    await fiveAsks(A);
    await at(600);
    await restart(A);
    clearCalls();
    await say(A, AFFILIATED_NO_EMAIL);
    expect(sentTexts()).toEqual([APPROVED]);
    clearCalls();
    await say(B, AFFILIATED);
    expect(sentTexts()).toEqual([HOURLY]);
    // 3 por la API y 2 por el bot dejan el sexto rechazado por cualquier canal.
    await cleanUp();
    transport.reset();
    await at(0);
    await acceptAs(A);
    const accepted = await acceptNotice(app, 'third_party');
    for (const seconds of [0, 120, 240]) {
      await at(seconds);
      expect((await requestCode(app, accepted.cookie, AFFILIATED)).status).toBe(202);
      await sends.flush();
    }
    for (const seconds of [360, 480]) {
      await at(seconds);
      await restart(A);
      clearCalls();
      await say(A, AFFILIATED);
      expect(sentTexts()).toEqual([APPROVED]);
    }
    await at(600);
    await restart(A);
    clearCalls();
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([HOURLY]);
    const viaApi = await requestCode(app, accepted.cookie, AFFILIATED);
    expect(viaApi.status).toBe(429);
    expect(viaApi.body.code).toBe('code_hourly_limit');
    expect(await challenges()).toHaveLength(5);
  });

  it('6.4 una cédula inexistente tiene el mismo límite y el mismo mensaje', async () => {
    await acceptAs(A);
    await fiveAsks(A, UNKNOWN);
    await at(600);
    await restart(A);
    clearCalls();
    await say(A, UNKNOWN);
    expect(sentTexts()).toEqual([HOURLY]);
  });

  it('6.5 los mensajes de espera y de límite no revelan afiliación, cuántos quedan ni el momento exacto', async () => {
    const tooSoonAt = async (seconds: number) => {
      await cleanUp();
      transport.reset();
      await at(0);
      await acceptAs(A);
      await ask(A, AFFILIATED, 0);
      await restart(A);
      await at(seconds);
      clearCalls();
      await say(A, AFFILIATED);
      return sentTexts();
    };
    expect(await tooSoonAt(10)).toEqual([TOO_SOON]);
    expect(await tooSoonAt(100)).toEqual([TOO_SOON]);
    expect(HOURLY).not.toMatch(/\d/);
    expect(TOO_SOON.replace('2 minutos', '')).not.toMatch(/\d/);
    await cleanUp();
    transport.reset();
    await acceptAs(A);
    await fiveAsks(A);
    await at(3000);
    await restart(A);
    clearCalls();
    await say(A, AFFILIATED);
    const early = sentTexts();
    await at(3590);
    clearCalls();
    await say(A, AFFILIATED);
    expect(early).toEqual([HOURLY]);
    expect(sentTexts()).toEqual([HOURLY]);
  });
});

describe('transversales', () => {
  it('T.1 los textos nuevos coinciden carácter por carácter con el anexo y los de F002 a F005 no cambian', async () => {
    const texts = await (async () => {
      await acceptAs(A);
      const first = await ask(A, AFFILIATED, 0, true);
      await at(601);
      await say(A, first.code);
      await push(A, PATH_EPS);
      await push(A, PATH_PRESENCIAL);
      await push(A, PATH_NEW);
      await say(A, AFFILIATED);
      await restart(A);
      await say(A, AFFILIATED);
      return sentTexts();
    })();
    expect(texts).toEqual([APPROVED, EXPIRED, EPS, IN_PERSON, ASK_NEW, APPROVED, ASK_CEDULA, TOO_SOON]);
    const exhaustedFlow = await (async () => {
      await cleanUp();
      transport.reset();
      await at(0);
      await acceptAs(A);
      const r = await ask(A);
      await exhaust(A, r.code);
      return sentTexts();
    })();
    expect(exhaustedFlow).toEqual([CODE_INCORRECT, CODE_INCORRECT, EXHAUSTED]);
    expect(CODE_USED).toBe('Este código ya se usó. Pida un código nuevo.');
    expect(CODE_NOT_SENT).toBe('No pudimos enviar el código. Intente de nuevo.');
    expect(CODE_INCOMPLETE).toBe('Código incompleto. Escriba los 6 dígitos.');
    expect(CEDULA_INVALID).toBe('Cédula inválida. Escriba entre 5 y 12 dígitos.');
  });

  it('T.2 los SMS y correos capturados no llevan medicamentos, diagnósticos, la cédula ni enlaces', async () => {
    await acceptAs(A);
    for (const [i, seconds] of [0, 120, 240].entries()) {
      await restart(A, i % 2 ? 'button' : 'start');
      await ask(A, AFFILIATED, seconds);
    }
    expect(allCaptured.length).toBeGreaterThanOrEqual(3);
    for (const m of allCaptured) {
      const whole = `${m.subject ?? ''}\n${m.body}`;
      for (const f of FORBIDDEN) expect(whole).not.toContain(f);
      expect(whole).not.toContain(AFFILIATED);
      expect(whole).not.toMatch(/https?:\/\/|www\./i);
    }
  });

  it('T.3 el webhook sigue exigiendo el secreto, también con el límite en su tope, y lleva las cabeceras de seguridad', async () => {
    await acceptAs(A);
    for (const seconds of [0, 120, 240, 360, 480]) {
      await restart(A);
      await ask(A, AFFILIATED, seconds);
    }
    await at(600);
    await restart(A);
    clearCalls();
    const before = await rowMap(pool);
    const rowBefore = await chatRow(A);
    const denied = await post(text(A, AFFILIATED), null);
    expect(denied.status).toBe(401);
    expect(transport.calls).toEqual([]);
    expect(await rowMap(pool)).toEqual(before);
    expect(await chatRow(A)).toEqual(rowBefore);
    const ok = await post(text(A, AFFILIATED));
    expect(ok.status).toBe(200);
    for (const res of [denied, ok]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeTruthy();
    }
    clearCalls();
    const invalid = await post({ nada: true });
    expect(invalid.status).toBe(200);
    expect(transport.calls).toEqual([]);
  });

  it('T.6 al final de cada prueba el reloj queda en 0 y no quedan retos', async () => {
    await acceptAs(A);
    await ask(A, AFFILIATED, 700);
    expect(Number((await pool.query('SELECT offset_seconds FROM app.test_clock')).rows[0].offset_seconds)).toBe(700);
  });

  it('T.6 (comprobación) el reloj está en 0 y no hay retos de la prueba anterior', async () => {
    expect(Number((await pool.query('SELECT offset_seconds FROM app.test_clock')).rows[0].offset_seconds)).toBe(0);
    expect((await pool.query('SELECT 1 FROM app.otp_challenges')).rowCount).toBe(0);
  });
});

describe('T.7 fallo del transporte (sendMessage falla)', () => {
  const NEST_PREFIX = /^\S*\[Nest\]\s+\d+\s+-\s+\d{2}\/\d{2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+/;
  const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
  const stripNoise = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, '').replace(NEST_PREFIX, '').replace(ISO_TIMESTAMP, '');
  const detects = (line: string) => /\d{5,}/.test(stripNoise(line));

  it('(i) mensaje de vencido o de agotado: el webhook responde 200 y nada cambia salvo el intento ya registrado', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    const needles = [AFFILIATED, code, process.env.TELEGRAM_BOT_TOKEN!];
    const logs = await captureLogs(async () => {
      await at(601);
      const convBefore = await conversation(A);
      const before = await rowMap(pool);
      transport.failWith('network');
      const expired = await say(A, code);
      expect(expired.status).toBe(200);
      expect(await conversation(A)).toEqual(convBefore);
      expect((await challengeRow(challengeId)).attempts_used).toBe(0);
      expect(rowDiff(before, await rowMap(pool))).toEqual({});
      transport.clearFailure();
      // Tercer error incorrecto: el servicio registra el intento antes de enviar.
      await at(0);
      await say(A, differentCode(code));
      await say(A, differentCode(differentCode(code)));
      const convMid = await conversation(A);
      const mapMid = await rowMap(pool);
      transport.failWith('server');
      const third = await say(A, differentCode(differentCode(differentCode(code))));
      expect(third.status).toBe(200);
      expect(await conversation(A)).toEqual(convMid);
      expect((await challengeRow(challengeId)).attempts_used).toBe(3);
      expect(rowDiff(mapMid, await rowMap(pool))).toEqual({});
      needles.push(code, differentCode(code));
    });
    expect(logs.split('\n').filter((l) => l.trim() !== '').filter(detects)).toEqual([]);
    for (const n of needles) expect(logs).not.toContain(n);
  });

  it('(ii) cédula válida: el reto se crea, el chat avanza aunque el mensaje no llegue, y el SMS sale igual', async () => {
    await acceptAs(A);
    let logs = '';
    transport.failWith('network');
    logs = await captureLogs(async () => {
      const res = await say(A, AFFILIATED);
      expect(res.status).toBe(200);
    });
    const rows = await challenges();
    expect(rows).toHaveLength(1);
    expect(rows[0].superseded_at).toBeNull();
    expect(rows[0].consumed_at).toBeNull();
    const conv = await conversation(A);
    expect(conv.step).toBe('awaiting_code');
    expect(conv.challengeId).toBe(rows[0].id);
    expect(transport.calls.filter((c) => c.text === APPROVED && !c.failed)).toEqual([]);
    const sms = await waitForSms(pool);
    expect(sms).toBeDefined();
    const code = codeIn(sms!.body);
    expect(logs.split('\n').filter((l) => l.trim() !== '').filter(detects)).toEqual([]);
    for (const n of [AFFILIATED, code, process.env.TELEGRAM_BOT_TOKEN!]) expect(logs).not.toContain(n);
  });
});

describe('registros (invariante 8)', () => {
  const NEST_PREFIX = /^\S*\[Nest\]\s+\d+\s+-\s+\d{2}\/\d{2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+/;
  const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
  const stripNoise = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, '').replace(NEST_PREFIX, '').replace(ISO_TIMESTAMP, '');
  const detects = (line: string) => /\d{5,}/.test(stripNoise(line));
  const lines = (logs: string) => logs.split('\n').filter((l) => l.trim() !== '');

  it('R.1 el detector marca una línea sintética con cédula y código y no las marcas de tiempo (control positivo)', () => {
    expect(detects('usuario 1000000001 codigo 204871')).toBe(true);
    expect(detects('[Nest] 17637  - 11/02/2026, 10:48:17 AM   ERROR [X] sin datos')).toBe(false);
    expect(detects('2026-11-02T10:48:17.123Z sin datos')).toBe(false);
  });

  it('R.1 el recorrido de F006 no deja datos en los registros', async () => {
    const typed = [AFFILIATED, UNKNOWN];
    const secrets: string[] = [];
    const logs = await captureLogs(async () => {
      await acceptAs(A);
      const first = await ask(A, AFFILIATED, 0);
      secrets.push(first.code, first.challengeId);
      await at(601);
      await say(A, first.code); // vencido
      for (const data of [PATH_EPS, PATH_PRESENCIAL, PATH_NEW]) await push(A, data);
      await say(A, AFFILIATED);
      await restart(A);
      await say(A, AFFILIATED); // espera (429 esperado)
      await at(0);
      await cleanUp();
      transport.reset();
      await acceptAs(A);
      const second = await ask(A);
      secrets.push(second.code, second.challengeId);
      await exhaust(A, second.code); // agotado
      await say(A, second.code);
      await at(120);
      const accepted = await acceptNotice(app, 'third_party');
      await requestCode(app, accepted.cookie, AFFILIATED);
      await sends.flush();
      await say(A, second.code); // anulado
      for (const seconds of [240, 360, 480]) {
        await restart(A);
        await ask(A, AFFILIATED, seconds);
      }
      await at(600);
      await restart(A);
      await say(A, AFFILIATED); // límite por hora (429 esperado)
    });
    const all = lines(logs);
    expect(all.filter(detects)).toEqual([]);
    const a = affiliate(AFFILIATED);
    const needles = [
      ...typed,
      ...secrets,
      a.mobilePhone,
      a.email!,
      process.env.TELEGRAM_BOT_TOKEN!,
      process.env.TELEGRAM_WEBHOOK_SECRET!,
      String(A),
      'chat_id',
      'from.id',
      'update_id',
      'callback_data',
      'path:',
    ];
    for (const needle of needles) expect(logs).not.toContain(needle);
  });

  it('R.1 un 429 esperado no escribe una línea de error y pulsar los tres botones no escribe callback_data ni chat_id', async () => {
    await acceptAs(A);
    await ask(A);
    await restart(A);
    clearCalls();
    const logs = await captureLogs(async () => {
      await say(A, AFFILIATED); // espera
      for (const data of [PATH_NEW, PATH_EPS, PATH_PRESENCIAL]) await push(A, data);
    });
    expect(lines(logs).filter((l) => /error|No se pudo/i.test(l))).toEqual([]);
    for (const needle of ['callback_data', 'chat_id', String(A), 'path:']) expect(logs).not.toContain(needle);
    await at(600);
    const hourly = await (async () => {
      await cleanUp();
      transport.reset();
      await at(0);
      await acceptAs(A);
      for (const seconds of [0, 120, 240, 360, 480]) {
        await restart(A);
        await ask(A, AFFILIATED, seconds);
      }
      await at(600);
      await restart(A);
      return captureLogs(async () => {
        await say(A, AFFILIATED);
      });
    })();
    expect(lines(hourly).filter((l) => /error|No se pudo/i.test(l))).toEqual([]);
    expect(sentTexts().at(-1)).toBe(HOURLY);
  });

  it('R.2 conversation solo guarda step, challengeId y pendingAcceptance, y ninguna columna de texto trae datos del paciente', async () => {
    await acceptAs(A);
    const first = await ask(A);
    await at(601);
    await say(A, first.code);
    for (const data of [PATH_NEW, PATH_EPS, PATH_PRESENCIAL]) {
      await push(A, data, { callback_query: { ...press(A, data).callback_query, from: { id: A, is_bot: false, first_name: 'Prueba Uno', username: 'prueba_uno' } } });
      const conv = await conversation(A);
      expect(Object.keys(conv).every((k) => ['step', 'challengeId', 'lastChallengeId', 'pendingAcceptance'].includes(k))).toBe(true);
    }
    await say(A, AFFILIATED);
    const a = affiliate(AFFILIATED);
    const needles = [AFFILIATED, UNKNOWN, first.code, a.mobilePhone, a.email!, a.fullName, 'prueba_uno', 'Prueba Uno'];
    const columns = await pool.query<{ table_schema: string; table_name: string; column_name: string }>(
      `SELECT table_schema, table_name, column_name FROM information_schema.columns
       WHERE table_schema IN ('app', 'public') AND NOT (table_schema = 'app' AND table_name = 'captured_messages')
         AND table_name NOT LIKE '%drizzle%' AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
    );
    expect(columns.rows.some((c) => c.table_name === 'telegram_chats' && c.column_name === 'conversation')).toBe(true);
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
