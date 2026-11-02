import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice';
import { EMAIL_SENDER, SMS_SENDER } from '../src/modules/notifications/messaging';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT, type RecordedCall } from '../src/modules/telegram/telegram-transport';
import { createTestApp } from './support/app';
import {
  AFFILIATED,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
  UNKNOWN,
  codeIn,
  createSeedPool,
  differentCode,
  fingerprintOf,
  loadFixtureAffiliates,
  resetIdentityData,
  setClockOffset,
  waitForMessages,
  waitForSms,
} from './support/identity';
import { trackSends } from './support/sends';
import { A, B, C, WEBHOOK, captureLogs, logSink, message, nextUpdateId, press, rowDiff, rowMap, text } from './support/telegram';

// F004, pasos 3, 4 y 5 más 7.4 (segunda parte), 7.7, transversales y registros (contracts/F004.md).
// Las cadenas están escritas aquí a propósito: la prueba no las toma del código.

const APPROVED =
  'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.';
const ASK_CEDULA = 'Gracias. Escriba la cédula del paciente. La cédula se usa solo para verificar la identidad y atender la solicitud.';
const VERIFIED = 'Identidad verificada';
const CODE_INCORRECT = 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.';
const CODE_USED = 'Este código ya se usó. Pida un código nuevo.';
const CEDULA_INVALID = 'Cédula inválida. Escriba entre 5 y 12 dígitos.';
const CODE_INCOMPLETE = 'Código incompleto. Escriba los 6 dígitos.';
const CODE_NOT_SENT = 'No pudimos enviar el código. Intente de nuevo.';
const CODE_NOT_VERIFIED = 'No pudimos verificar el código. Intente de nuevo.';
// F006: el código vencido ya no recibe el texto genérico, sino el de vencido con los tres caminos.
const CODE_EXPIRED = 'El código venció. Elija una opción para continuar.';
const NOTICE = `${PRIVACY_NOTICE.title}\n\n${PRIVACY_NOTICE.body}\n\n${PRIVACY_NOTICE.declaration}`;

const affiliates: Array<{ cedula: string; fullName: string; mobilePhone: string; email: string | null }> = JSON.parse(
  readFileSync(FIXTURE_AFFILIATES, 'utf8'),
);
const affiliate = (cedula: string) => affiliates.find((a) => a.cedula === cedula)!;

let app: NestExpressApplication;
let failApp: NestExpressApplication;
let pool: Pool;
let transport: CaptureTelegramTransport;
let sends: ReturnType<typeof trackSends>;
let failSends: ReturnType<typeof trackSends>;

const post = (update: unknown, secret: string | null = process.env.TELEGRAM_WEBHOOK_SECRET!, target = app) => {
  const req = request(target.getHttpServer()).post(WEBHOOK);
  return (secret === null ? req : req.set('X-Telegram-Bot-Api-Secret-Token', secret)).send(update as object);
};
const sent = () => transport.calls.filter((c) => c.method === 'sendMessage');
const sentTexts = () => sent().map((c) => c.text);
const chatRow = async (chatId: number) => (await pool.query('SELECT * FROM telegram_chats WHERE chat_id = $1', [chatId])).rows[0];
const conversation = async (chatId: number) => (await chatRow(chatId))?.conversation;
const challengeRow = async (id: string) => (await pool.query('SELECT * FROM app.otp_challenges WHERE id = $1', [id])).rows[0];

async function acceptAs(chatId: number, kind: 'holder' | 'third_party' = 'holder') {
  await post(message(chatId)).expect(200);
  await post(press(chatId, `accept:${kind}`)).expect(200);
  transport.calls.length = 0;
}
async function say(chatId: number, value: string, target = app, tracker = sends) {
  const res = await post(text(chatId, value), process.env.TELEGRAM_WEBHOOK_SECRET!, target);
  await tracker.flush();
  return res;
}
/** Pide el código por el bot y devuelve el código del SMS capturado y el reto. */
async function ask(chatId: number, cedula = AFFILIATED, keepCalls = false) {
  await pool.query('TRUNCATE app.captured_messages');
  // F005: entre dos pedidos de la misma cédula deben pasar 120 s; si la cédula ya tiene retos, se adelanta el reloj.
  const previous = await pool.query('SELECT 1 FROM app.otp_challenges WHERE cedula_fingerprint = $1', [fingerprintOf(cedula)]);
  if (previous.rowCount) await advanceClock(120);
  await say(chatId, cedula);
  const sms = (await waitForSms(pool))!;
  const challengeId = (await conversation(chatId)).challengeId as string;
  if (!keepCalls) transport.calls.length = 0;
  return { code: codeIn(sms.body), challengeId };
}
const advanceClock = (seconds: number) => pool.query('UPDATE app.test_clock SET offset_seconds = offset_seconds + $1', [seconds]);
async function clockNow(): Promise<Date> {
  return (await pool.query<{ now: Date }>('SELECT app.clock_now() AS now')).rows[0].now;
}
const within5s = (value: Date, reference: Date) => Math.abs(value.getTime() - reference.getTime()) <= 5000;

const PROTECTED = ['app.consent_records', 'app.patient_refs', 'app.channel_bindings', 'app.browser_devices'];
const protectedUnchanged = (before: Record<string, number>, after: Record<string, number>) => {
  const diff = rowDiff(before, after);
  return PROTECTED.filter((t) => t in diff);
};

async function cleanUp() {
  await pool.query('DROP TRIGGER IF EXISTS f004_fail ON app.consent_records');
  await pool.query('DROP FUNCTION IF EXISTS app.f004_fail()');
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
}

beforeAll(async () => {
  pool = createSeedPool();
  await loadFixtureAffiliates(pool);
  app = await createTestApp({ logger: logSink });
  transport = app.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
  sends = trackSends(app);
  const failing = { send: () => Promise.reject(new Error('falla simulada con 3000000001')) };
  failApp = await createTestApp({ logger: logSink, overrides: [[SMS_SENDER, failing], [EMAIL_SENDER, failing]] });
  failSends = trackSends(failApp);
});
beforeEach(async () => {
  transport.reset();
  await cleanUp();
});
afterEach(async () => {
  await sends.flush();
  await failSends.flush();
  await setClockOffset(pool, 0);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanUp();
  await app.close();
  await failApp.close();
  await pool.end();
});

describe('paso 3: código correcto antes de 10 minutos', () => {
  it('3.1 el código del SMS verifica la identidad: "Identidad verificada" y el paso verified', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await setClockOffset(pool, 300);
    const res = await say(A, code);
    expect(res.status).toBe(200);
    expect(sentTexts()).toEqual([VERIFIED]);
    const conv = await conversation(A);
    expect(conv.step).toBe('verified');
    expect(conv.lastChallengeId).toBe(challengeId);
    expect(conv.challengeId).toBeUndefined();
  });

  it('3.2 crea 1 patient_refs, 1 consent_records y 1 channel_bindings del chat, y ningún browser_devices', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    const before = await rowMap(pool);
    await say(A, code);
    expect(rowDiff(before, await rowMap(pool))).toEqual({
      'app.patient_refs': 1,
      'app.consent_records': 1,
      'app.channel_bindings': 1,
    });
    const patient = (await pool.query('SELECT p.*, a.cedula FROM app.patient_refs p JOIN sim.affiliates a ON a.id = p.sim_affiliate_id')).rows;
    expect(patient).toHaveLength(1);
    expect(patient[0].cedula).toBe(AFFILIATED);
    const { rows } = await pool.query(
      `SELECT b.*, (b.expires_at = b.created_at + interval '3 months') AS three_months FROM app.channel_bindings b`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].telegram_chat_id).toBe((await chatRow(A)).id);
    expect(rows[0].browser_device_id).toBeNull();
    expect(rows[0].revoked_at).toBeNull();
    expect(rows[0].three_months).toBe(true);
    expect(within5s(rows[0].created_at, await clockNow())).toBe(true);
    expect((await rowMap(pool))['app.browser_devices']).toBe(0);
  });

  it('3.3 el reto queda consumido con la hora del reloj de la aplicación', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await setClockOffset(pool, 300);
    await say(A, code);
    const row = await challengeRow(challengeId);
    expect(row.consumed_at).not.toBeNull();
    expect(within5s(row.consumed_at, await clockNow())).toBe(true);
  });

  it('3.4 con el reloj adelantado 9 minutos el código correcto se acepta', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await setClockOffset(pool, 540);
    await say(A, code);
    expect(sentTexts()).toEqual([VERIFIED]);
  });

  it('3.5 un código de 6 dígitos distinto: "Código incorrecto", un intento y nada se crea', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    const before = await rowMap(pool);
    await say(A, differentCode(code));
    expect(sentTexts()).toEqual([CODE_INCORRECT]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(1);
    expect(protectedUnchanged(before, await rowMap(pool))).toEqual([]);
    expect((await conversation(A)).step).toBe('awaiting_code');
  });

  it.each([['12345'], ['1234567'], ['abcdef'], ['123 456'], [AFFILIATED]])(
    '3.6 (Inferido) en awaiting_code el texto %j recibe "Código incompleto", sin intento ni filas',
    async (value) => {
      await acceptAs(A);
      const { challengeId } = await ask(A);
      const before = await rowMap(pool);
      await say(A, value);
      expect(sentTexts()).toEqual([CODE_INCOMPLETE]);
      expect((await challengeRow(challengeId)).attempts_used).toBe(0);
      expect(await rowMap(pool)).toEqual(before);
    },
  );

  it('3.7 el código de otro chat no vincula: Código incorrecto, B sin vinculación, el reto de A intacto', async () => {
    await acceptAs(A);
    await acceptAs(B);
    const a = await ask(A, AFFILIATED);
    const b = await ask(B, AFFILIATED_NO_EMAIL);
    await say(B, a.code);
    expect(sentTexts()).toEqual([CODE_INCORRECT]);
    expect((await pool.query('SELECT 1 FROM app.channel_bindings')).rowCount).toBe(0);
    const ra = await challengeRow(a.challengeId);
    expect(ra.consumed_at).toBeNull();
    expect(ra.attempts_used).toBe(0);
    expect((await challengeRow(b.challengeId)).attempts_used).toBe(1);
    transport.calls.length = 0;
    await say(A, a.code);
    expect(sentTexts()).toEqual([VERIFIED]);
    const bindings = await pool.query('SELECT telegram_chat_id FROM app.channel_bindings');
    expect(bindings.rows.map((r) => r.telegram_chat_id)).toEqual([(await chatRow(A)).id]);
  });

  it('3.8 el código de A escrito por un chat que espera la cédula se trata como cédula y no vincula', async () => {
    await acceptAs(A);
    await acceptAs(B);
    const a = await ask(A);
    await say(B, a.code);
    expect(sentTexts()).toEqual([APPROVED]);
    expect((await pool.query('SELECT 1 FROM app.channel_bindings')).rowCount).toBe(0);
    const ra = await challengeRow(a.challengeId);
    expect(ra.consumed_at).toBeNull();
    expect(ra.attempts_used).toBe(0);
    expect(ra.superseded_at).toBeNull();
  });

  it('3.9 (Inferido) la segunda verificación del mismo paciente en el mismo chat reutiliza la vinculación', async () => {
    await acceptAs(A);
    const first = await ask(A);
    await say(A, first.code);
    const binding = (await pool.query('SELECT id, expires_at FROM app.channel_bindings')).rows[0];
    const acceptedAt = (await pool.query('SELECT accepted_at FROM app.consent_records')).rows[0].accepted_at;
    transport.calls.length = 0;
    await post(message(A)).expect(200);
    expect(sentTexts()).toEqual([ASK_CEDULA]);
    expect((await conversation(A)).step).toBe('awaiting_cedula');
    const second = await ask(A);
    const before = await rowMap(pool);
    await say(A, second.code);
    expect(sentTexts()).toEqual([VERIFIED]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({ 'app.consent_records': 1 });
    expect((await rowMap(pool))['app.patient_refs']).toBe(1);
    expect((await pool.query('SELECT id, expires_at FROM app.channel_bindings')).rows).toEqual([binding]);
    expect((await pool.query('SELECT 1 FROM telegram_chats WHERE chat_id = $1', [A])).rowCount).toBe(1);
    const consents = (await pool.query('SELECT accepted_at FROM app.consent_records')).rows;
    expect(consents.map((r) => r.accepted_at.getTime())).toEqual([acceptedAt.getTime(), acceptedAt.getTime()]);
  });

  it('3.10 (Inferido) el mismo paciente desde otro chat crea su vinculación y su consentimiento', async () => {
    await acceptAs(A);
    await say(A, (await ask(A)).code);
    await acceptAs(C);
    const acceptedC = new Date((await conversation(C)).pendingAcceptance.acceptedAt);
    await say(C, (await ask(C)).code);
    expect(sentTexts()).toEqual([VERIFIED]);
    const map = await rowMap(pool);
    expect(map['app.patient_refs']).toBe(1);
    expect(map['app.channel_bindings']).toBe(2);
    const forC = await pool.query('SELECT b.id FROM app.channel_bindings b WHERE b.telegram_chat_id = $1', [(await chatRow(C)).id]);
    expect(forC.rowCount).toBe(1);
    const consents = (await pool.query('SELECT accepted_at FROM app.consent_records ORDER BY recorded_at')).rows;
    expect(consents).toHaveLength(2);
    expect(consents[1].accepted_at.getTime()).toBe(acceptedC.getTime());
  });

  it('3.11 (Inferido) un código vencido no se acepta, no suma intento y el reenvío no cambia nada', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    const convBefore = await conversation(A);
    const before = await rowMap(pool);
    await setClockOffset(pool, 660);
    await say(A, code);
    expect(sentTexts()).toEqual([CODE_EXPIRED]);
    expect(protectedUnchanged(before, await rowMap(pool))).toEqual([]);
    const row = await challengeRow(challengeId);
    expect(row.consumed_at).toBeNull();
    expect(row.attempts_used).toBe(0);
    expect(await conversation(A)).toEqual(convBefore);
    const mapAfterFirst = await rowMap(pool);
    transport.calls.length = 0;
    await say(A, code);
    expect(sentTexts()).toEqual([CODE_EXPIRED]);
    expect(await rowMap(pool)).toEqual(mapAfterFirst);
    expect((await challengeRow(challengeId)).attempts_used).toBe(0);
  });

  it('3.12 (Inferido) /start en awaiting_code vuelve a pedir la cédula sin consumir el reto', async () => {
    await acceptAs(A);
    const { challengeId } = await ask(A);
    const pending = (await conversation(A)).pendingAcceptance;
    const before = await rowMap(pool);
    await post(message(A)).expect(200);
    expect(sentTexts()).toEqual([ASK_CEDULA]);
    const conv = await conversation(A);
    expect(conv.step).toBe('awaiting_cedula');
    expect('challengeId' in conv).toBe(false);
    expect(conv.pendingAcceptance).toEqual(pending);
    const row = await challengeRow(challengeId);
    expect(row.consumed_at).toBeNull();
    expect(row.attempts_used).toBe(0);
    expect(protectedUnchanged(before, await rowMap(pool))).toEqual([]);
    transport.calls.length = 0;
    await advanceClock(120); // F005: espera de 2 minutos
    await say(A, AFFILIATED);
    expect(sentTexts()).toEqual([APPROVED]);
    expect((await conversation(A)).challengeId).not.toBe(challengeId);
  });
});

describe('paso 4: la aceptación queda registrada en la base', () => {
  it.each([['holder' as const], ['third_party' as const]])('4.1 y 4.4 el registro de la aceptación como %s tiene los datos del chat', async (kind) => {
    await acceptAs(A, kind);
    const pending = (await conversation(A)).pendingAcceptance;
    const { code } = await ask(A);
    await say(A, code);
    const rows = (await pool.query('SELECT * FROM app.consent_records')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('data_processing');
    expect(rows[0].declarant).toBe(kind);
    expect(rows[0].channel).toBe('telegram');
    expect(rows[0].notice_version).toBe(pending.noticeVersion);
    const notice = await request(app.getHttpServer()).get('/api/v1/privacy-notice');
    expect(rows[0].notice_version).toBe(notice.body.version);
    expect(rows[0].cedula_fingerprint).toBe(fingerprintOf(AFFILIATED));
  });

  it('4.2 accepted_at es el de la aceptación (a precisión de milisegundo) y no el de la verificación', async () => {
    await acceptAs(A);
    const pending = (await conversation(A)).pendingAcceptance;
    const { code } = await ask(A);
    await setClockOffset(pool, 300);
    await say(A, code);
    const row = (await pool.query('SELECT accepted_at, recorded_at, EXTRACT(EPOCH FROM recorded_at - accepted_at) AS gap FROM app.consent_records')).rows[0];
    expect(row.accepted_at.getTime()).toBe(new Date(pending.acceptedAt).getTime());
    expect(Number(row.gap)).toBeGreaterThanOrEqual(300);
  });

  it('4.3 recorded_at sale del reloj de la aplicación', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await setClockOffset(pool, 300);
    await say(A, code);
    const row = (await pool.query('SELECT recorded_at FROM app.consent_records')).rows[0];
    expect(within5s(row.recorded_at, await clockNow())).toBe(true);
  });

  it('4.5 antes de verificar el código no hay consentimiento ni vinculación (invariante 3, R-29)', async () => {
    await acceptAs(A);
    await ask(A);
    expect((await pool.query('SELECT 1 FROM app.consent_records')).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM app.channel_bindings')).rowCount).toBe(0);
  });

  it('4.6 el declarante y la fecha salen de lo guardado al aceptar, no de lo que se escribe después', async () => {
    await acceptAs(A, 'holder');
    const pending = (await conversation(A)).pendingAcceptance;
    await post(text(A, 'third_party')).expect(200);
    await post(press(A, 'accept:third_party')).expect(200);
    transport.calls.length = 0;
    const { code } = await ask(A);
    await say(A, code);
    const row = (await pool.query('SELECT declarant, accepted_at FROM app.consent_records')).rows[0];
    expect(row.declarant).toBe('holder');
    expect(row.accepted_at.getTime()).toBe(new Date(pending.acceptedAt).getTime());
  });

  it('4.7 si falla la transacción no queda nada ni se cuenta intento; al retirar el fallo el mismo código se acepta', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await pool.query(`CREATE FUNCTION app.f004_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$`);
    await pool.query('CREATE TRIGGER f004_fail BEFORE INSERT ON app.consent_records FOR EACH ROW EXECUTE FUNCTION app.f004_fail()');
    const before = await rowMap(pool);
    const res = await say(A, code);
    expect(res.status).toBe(200);
    expect(sentTexts()).toEqual([CODE_NOT_VERIFIED]);
    const row = await challengeRow(challengeId);
    expect(row.consumed_at).toBeNull();
    expect(row.attempts_used).toBe(0);
    expect(await rowMap(pool)).toEqual(before);
    expect((await conversation(A)).step).toBe('awaiting_code');
    await pool.query('DROP TRIGGER f004_fail ON app.consent_records');
    transport.calls.length = 0;
    await say(A, code);
    expect(sentTexts()).toEqual([VERIFIED]);
    expect(rowDiff(before, await rowMap(pool))).toEqual({ 'app.patient_refs': 1, 'app.consent_records': 1, 'app.channel_bindings': 1 });
  });
});

describe('paso 5: el mismo código no se puede usar otra vez', () => {
  it('5.1 reenviar el código aceptado responde "Código ya usado" y no cambia filas', async () => {
    await acceptAs(A);
    const { code } = await ask(A);
    await say(A, code);
    const after = await rowMap(pool);
    transport.calls.length = 0;
    await say(A, code);
    expect(sentTexts()).toEqual([CODE_USED]);
    expect(await rowMap(pool)).toEqual(after);
  });

  it('5.2 dos actualizaciones simultáneas con el mismo código: una sola verificación (10 vueltas)', async () => {
    for (let i = 0; i < 10; i++) {
      await cleanUp();
      transport.reset();
      await acceptAs(A);
      const { code, challengeId } = await ask(A);
      const before = await rowMap(pool);
      const [r1, r2] = await Promise.all([post(text(A, code)), post(text(A, code))]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect(sentTexts().sort()).toEqual([CODE_USED, VERIFIED].sort());
      expect(rowDiff(before, await rowMap(pool))).toEqual({ 'app.patient_refs': 1, 'app.consent_records': 1, 'app.channel_bindings': 1 });
      const row = await challengeRow(challengeId);
      expect(row.attempts_used).toBe(0);
      expect(row.consumed_at).not.toBeNull();
      const conv = await conversation(A);
      expect(conv.step).toBe('verified');
      expect(conv.lastChallengeId).toBe(challengeId);
    }
  });

  it('5.3 (Inferido) en verified otro código de 6 dígitos también recibe "Código ya usado", sin intentos ni filas', async () => {
    await acceptAs(A);
    const { code, challengeId } = await ask(A);
    await say(A, code);
    const after = await rowMap(pool);
    transport.calls.length = 0;
    await say(A, differentCode(code));
    expect(sentTexts()).toEqual([CODE_USED]);
    expect((await challengeRow(challengeId)).attempts_used).toBe(0);
    expect(await rowMap(pool)).toEqual(after);
  });
});

describe('paso 7 (segunda parte): tras una cédula inexistente un código recibe "Código incorrecto"', () => {
  it('7.4 la llamada es la misma que la de una afiliada con un código errado', async () => {
    await acceptAs(A);
    await say(A, UNKNOWN);
    transport.calls.length = 0;
    await say(A, '000000');
    const forUnknown = JSON.stringify(transport.calls);
    await post(message(A));
    const { code } = await ask(A);
    await say(A, differentCode(code));
    expect(sentTexts()).toEqual([CODE_INCORRECT]);
    expect(JSON.stringify(transport.calls)).toBe(forUnknown);
  });
});

describe('7.7 el bot no repite lo que escribe el usuario', () => {
  const offending = (calls: RecordedCall[], needles: string[]) =>
    calls.filter((c) => needles.some((n) => (c.text ?? '').includes(n)));

  it('el detector marca una llamada sintética que contiene la cédula (control positivo)', () => {
    const synthetic: RecordedCall = { method: 'sendMessage', chatId: A, text: `Su cédula ${AFFILIATED}`, keys: ['chat_id', 'text'] };
    expect(offending([synthetic], [AFFILIATED])).toEqual([synthetic]);
  });

  it('en todos los caminos ninguna llamada repite la cédula ni el código escritos y sus claves son chat_id y text', async () => {
    const typed: string[] = [];
    const speak = async (value: string) => {
      typed.push(value);
      return say(A, value);
    };
    await post(message(A));
    await post(press(A, 'accept:holder'));
    transport.calls.length = 0; // el aviso y la petición de cédula son de F002 (el aviso lleva teclado)
    await speak('abc'); // inválida
    await speak('mi cédula es 1000000001'); // texto libre
    await speak(UNKNOWN); // inexistente
    await speak('000000');
    await post(message(A));
    const real = await ask(A, AFFILIATED, true);
    typed.push(real.code);
    await speak('12345'); // incompleto
    const wrong = differentCode(real.code);
    await speak(wrong); // incorrecto
    await setClockOffset(pool, 660);
    await speak(real.code); // vencido
    await setClockOffset(pool, 0);
    await post(message(A));
    const second = await ask(A, AFFILIATED, true);
    await speak(second.code); // correcto
    await speak(second.code); // ya usado
    await post(message(A));
    vi.spyOn(app.get(IdentityService), 'requestCode').mockRejectedValueOnce(new Error('falla forzada'));
    await speak(AFFILIATED); // error
    typed.push(AFFILIATED, second.code, UNKNOWN, 'mi cédula es 1000000001', '12345', 'abc');
    const replies = transport.calls.filter((c) => c.method === 'sendMessage');
    expect(replies.length).toBeGreaterThan(8);
    expect(offending(replies, typed)).toEqual([]);
    for (const c of replies) {
      // F006: el mensaje de vencido lleva los tres caminos (reply_markup); los demás siguen sin teclado.
      if (c.text === CODE_EXPIRED) {
        expect(c.replyMarkup).toBeDefined();
        expect([...c.keys].sort()).toEqual(['chat_id', 'reply_markup', 'text']);
        continue;
      }
      expect(c.replyMarkup).toBeUndefined();
      expect([...c.keys].sort()).toEqual(['chat_id', 'text']);
    }
    expect(transport.calls.filter((c) => c.keys.includes('reply_parameters') || c.keys.includes('reply_to_message_id'))).toEqual([]);
  });
});

describe('transversales', () => {
  it('T.1 los textos del bot en todos los caminos coinciden con la lista de cadenas exactas', async () => {
    await post(message(A));
    expect(sentTexts()).toEqual([NOTICE]);
    await post(press(A, 'accept:holder'));
    await say(A, 'abc');
    const real = await ask(A, AFFILIATED, true);
    await say(A, '12');
    await say(A, differentCode(real.code));
    await say(A, real.code);
    await say(A, real.code);
    vi.spyOn(app.get(IdentityService), 'requestCode').mockRejectedValueOnce(new Error('falla forzada'));
    await post(message(A));
    await say(A, AFFILIATED);
    await setClockOffset(pool, 0);
    expect(sentTexts()).toEqual([NOTICE, ASK_CEDULA, CEDULA_INVALID, APPROVED, CODE_INCOMPLETE, CODE_INCORRECT, VERIFIED, CODE_USED, ASK_CEDULA, CODE_NOT_SENT]);
  });

  it('T.3 las respuestas del webhook llevan nosniff y Content-Security-Policy tras el flujo de cédula', async () => {
    await acceptAs(A);
    for (const res of [await post(text(A, AFFILIATED)), await post(text(A, AFFILIATED), 'incorrecto')]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeTruthy();
    }
  });
});

describe('registros (invariante 8)', () => {
  const NEST_PREFIX = /^\S*\[Nest\]\s+\d+\s+-\s+\d{2}\/\d{2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+/;
  const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
  const stripNoise = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, '').replace(NEST_PREFIX, '').replace(ISO_TIMESTAMP, '');
  const detects = (line: string) => /\d{5,}/.test(stripNoise(line));

  it('R.1 el detector marca una línea sintética con cédula y código (control positivo) y no las marcas de tiempo', () => {
    expect(detects('usuario 1000000001 codigo 204871')).toBe(true);
    expect(detects('[Nest] 17637  - 11/02/2026, 10:48:17 AM   ERROR [X] sin datos')).toBe(false);
    expect(detects('2026-11-02T10:48:17.123Z sin datos')).toBe(false);
  });

  it('R.1 y R.3 el recorrido completo, con fallos de Telegram, SMS, correo y base, no deja datos en los registros', async () => {
    const typed: string[] = [];
    const secrets: string[] = [];
    const speak = async (value: string) => {
      typed.push(value);
      return say(A, value);
    };
    const logs = await captureLogs(async () => {
      await post(message(A));
      await post(press(A, 'accept:holder'));
      for (const bad of ['abc', '1234', '1000000000001', '1000 000 001', 'mi cédula es 1000000001']) await speak(bad);
      await speak(UNKNOWN);
      await speak('000000');
      await post(message(A));
      const real = await ask(A);
      secrets.push(real.code, real.challengeId);
      await speak(AFFILIATED); // cédula de 10 dígitos en awaiting_code
      await speak('12345');
      await speak(differentCode(real.code));
      await setClockOffset(pool, 660);
      await speak(real.code); // vencido
      await setClockOffset(pool, 0);
      // Fallo de la base dentro de la transacción.
      await pool.query(`CREATE FUNCTION app.f004_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo con 1000000001'; END $$`);
      await pool.query('CREATE TRIGGER f004_fail BEFORE INSERT ON app.consent_records FOR EACH ROW EXECUTE FUNCTION app.f004_fail()');
      await speak(real.code);
      await pool.query('DROP TRIGGER f004_fail ON app.consent_records');
      await post(message(A));
      const again = await ask(A);
      secrets.push(again.code, again.challengeId);
      transport.failWith('server'); // fallo de Telegram
      await speak(again.code);
      transport.clearFailure();
      await speak(again.code); // ya usado
      // Fallos de SMS y correo (R.3), con el bot de la aplicación que falla.
      const failTransport = failApp.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
      await post(message(B), process.env.TELEGRAM_WEBHOOK_SECRET!, failApp);
      await post(press(B, 'accept:holder'), process.env.TELEGRAM_WEBHOOK_SECRET!, failApp);
      await advanceClock(120); // F005: espera de 2 minutos
      typed.push(AFFILIATED);
      const res = await say(B, AFFILIATED, failApp, failSends);
      expect(res.status).toBe(200);
      expect(failTransport.calls.at(-1)?.text).toBe(APPROVED);
      failTransport.clearFailure();
    });
    const all = logs.split('\n').filter((l) => l.trim() !== '');
    expect(all.filter(detects)).toEqual([]);
    const a = affiliate(AFFILIATED);
    const needles = [...typed, ...secrets, a.mobilePhone, a.email!, process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_WEBHOOK_SECRET!];
    for (const needle of needles) expect(logs).not.toContain(needle);
  });

  it('R.2 la cédula, el código, los contactos y los datos de Telegram no están en ninguna columna de texto', async () => {
    await acceptAs(A);
    const real = await ask(A);
    await say(A, real.code);
    await acceptAs(B);
    await say(B, UNKNOWN);
    const a = affiliate(AFFILIATED);
    const needles = [AFFILIATED, UNKNOWN, real.code, a.mobilePhone, a.email!, a.fullName, 'prueba_uno', 'Prueba Uno'];
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
    // Control positivo: la misma búsqueda encuentra la cédula en sim.affiliates.
    const control = await pool.query<{ v: string }>('SELECT cedula AS v FROM sim.affiliates');
    expect(control.rows.some(({ v }) => v.includes(AFFILIATED))).toBe(true);
  });
});
