import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/modules/identity/identity.service.js';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice.js';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT, type RecordedCall } from '../src/modules/telegram/telegram-transport.js';
import { createTestApp } from './support/app.js';
import {
  AFFILIATED,
  AFFILIATED_INACTIVE,
  AFFILIATED_NO_EMAIL,
  FIXTURE_AFFILIATES,
  UNKNOWN,
  acceptNotice,
  capturedMessages,
  codeIn,
  createSeedPool,
  fingerprintOf,
  loadFixtureAffiliates,
  requestCode,
  resetIdentityData,
  setClockOffset,
  waitForMessages,
  waitForSms,
} from './support/identity.js';
import { trackSends } from './support/sends.js';
import { A, NEW_CHAT, WEBHOOK, logSink, message, nextUpdateId, press, rowDiff, rowMap, text } from './support/telegram.js';

// F004, pasos 1, 2, 6 y 7: la cédula por Telegram y el envío del código (contracts/F004.md).
// Las cadenas están escritas aquí a propósito: la prueba no las toma del código.

const APPROVED =
  'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.';
const CEDULA_INVALID = 'Cédula inválida. Escriba entre 5 y 12 dígitos.';
const CODE_INCOMPLETE = 'Código incompleto. Escriba los 6 dígitos.';
const CODE_NOT_SENT = 'No pudimos enviar el código. Intente de nuevo.';
const SMS = (code: string) => `Pharma Express: tu codigo de verificacion es ${code}. Vence en 10 minutos.`;
const EMAIL_SUBJECT = 'Pharma Express: codigo de verificacion';
const EMAIL_BODY = (code: string) => `Tu codigo de verificacion es ${code}. Vence en 10 minutos. Si no lo pediste, ignora este mensaje.`;

interface Fixture {
  cedula: string;
  fullName: string;
  eps: string;
  mobilePhone: string;
  email: string | null;
}
const fixture: Fixture[] = JSON.parse(readFileSync(FIXTURE_AFFILIATES, 'utf8'));
const affiliate = (cedula: string) => fixture.find((a) => a.cedula === cedula)!;

let app: NestExpressApplication;
let pool: Pool;
let transport: CaptureTelegramTransport;
let sends: ReturnType<typeof trackSends>;

// `secret` omitido usa el secreto de pruebas; `null` no envía la cabecera.
const post = (update: unknown, secret: string | null = process.env.TELEGRAM_WEBHOOK_SECRET!) => {
  const req = request(app.getHttpServer()).post(WEBHOOK);
  return (secret === null ? req : req.set('X-Telegram-Bot-Api-Secret-Token', secret)).send(update as object);
};
const sent = () => transport.calls.filter((c) => c.method === 'sendMessage');
const conversation = async (chatId: number) =>
  (await pool.query('SELECT conversation FROM telegram_chats WHERE chat_id = $1', [chatId])).rows[0]?.conversation;
const challenges = async () => (await pool.query('SELECT * FROM app.otp_challenges ORDER BY created_at')).rows;

/** El chat inicia, acepta y queda esperando la cédula; las llamadas del arranque se descartan. */
async function acceptAs(chatId: number, kind: 'holder' | 'third_party' = 'holder') {
  await post(message(chatId)).expect(200);
  await post(press(chatId, `accept:${kind}`)).expect(200);
  transport.calls.length = 0;
}
/** Envía un texto, espera los envíos pendientes y devuelve la respuesta. */
async function say(chatId: number, value: string) {
  const res = await post(text(chatId, value));
  await sends.flush();
  return res;
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
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
});
afterEach(async () => {
  await sends.flush();
  await setClockOffset(pool, 0);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await resetIdentityData(pool);
  await pool.query('DELETE FROM telegram_chats');
  await app.close();
  await pool.end();
});

describe('paso 1: aceptar como titular y enviar la cédula', () => {
  it('1.1 /start, accept:holder y la cédula: un reto verify con la huella, 10 minutos y el paso awaiting_code', async () => {
    await post(message(A)).expect(200);
    await post(press(A, 'accept:holder')).expect(200);
    await post(text(A, AFFILIATED)).expect(200);
    await sends.flush();
    const rows = await pool.query(
      `SELECT *, (expires_at BETWEEN app.clock_now() + interval '10 minutes' - interval '5 seconds'
                              AND app.clock_now() + interval '10 minutes') AS ten_minutes FROM app.otp_challenges`,
    );
    expect(rows.rows).toHaveLength(1);
    const [row] = rows.rows;
    expect(row.purpose).toBe('verify');
    expect(row.cedula_fingerprint).toBe(fingerprintOf(AFFILIATED));
    expect(row.code_hash).not.toBeNull();
    expect(row.attempts_used).toBe(0);
    expect(row.consumed_at).toBeNull();
    expect(row.superseded_at).toBeNull();
    expect(row.ten_minutes).toBe(true);
    const conv = await conversation(A);
    expect(conv.step).toBe('awaiting_code');
    expect(conv.challengeId).toBe(row.id);
  });

  it('1.2 la hora de aceptación es la de accept:holder y no cambia al enviar la cédula', async () => {
    await post(message(A));
    const h = (await pool.query<{ h: Date }>('SELECT app.clock_now() AS h')).rows[0].h;
    await post(press(A, 'accept:holder'));
    const acceptedAt = new Date((await conversation(A)).pendingAcceptance.acceptedAt);
    expect(acceptedAt.getTime()).toBeGreaterThanOrEqual(h.getTime());
    expect(acceptedAt.getTime()).toBeLessThanOrEqual(h.getTime() + 5000);
    await say(A, AFFILIATED);
    expect(new Date((await conversation(A)).pendingAcceptance.acceptedAt)).toEqual(acceptedAt);
  });

  it('1.3 conversation solo guarda paso, challengeId y la aceptación pendiente, sin datos del paciente ni del código', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED);
    const conv = await conversation(A);
    expect(Object.keys(conv).sort()).toEqual(['challengeId', 'pendingAcceptance', 'step']);
    expect(Object.keys(conv.pendingAcceptance).sort()).toEqual(['acceptedAt', 'declarant', 'noticeVersion']);
    const [sms] = (await waitForMessages(pool, 2)).filter((m) => m.channel === 'sms');
    const serialized = JSON.stringify(conv);
    const a = affiliate(AFFILIATED);
    for (const secret of [AFFILIATED, a.mobilePhone, a.email!, codeIn(sms.body), a.fullName]) expect(serialized).not.toContain(secret);
  });

  it.each([['abc'], ['1234'], ['1000000000001'], ['1000 000 001'], ['   ']])(
    '1.4 la cédula con formato inválido %j recibe "Cédula inválida" y no cambia nada',
    async (value) => {
      await acceptAs(A);
      const before = await rowMap(pool);
      await say(A, value);
      expect(sent().map((c) => c.text)).toEqual([CEDULA_INVALID]);
      expect(await rowMap(pool)).toEqual(before);
      expect((await conversation(A)).step).toBe('awaiting_cedula');
      expect(await capturedMessages(pool)).toEqual([]);
    },
  );

  it('1.4b (Inferido) los espacios en los extremos se recortan y se trata como 1.1', async () => {
    await acceptAs(A);
    const before = await rowMap(pool);
    await say(A, `  ${AFFILIATED} `);
    const rows = await challenges();
    expect(rows).toHaveLength(1);
    expect(rows[0].cedula_fingerprint).toBe(fingerprintOf(AFFILIATED));
    expect((await conversation(A)).step).toBe('awaiting_code');
    expect(sent().map((c) => c.text)).toEqual([APPROVED]);
    expect((await waitForMessages(pool, 2)).length).toBe(2);
    expect(rowDiff(before, await rowMap(pool))).toEqual({ 'app.otp_challenges': 1, 'app.captured_messages': 2 });
  });

  it('1.5 sin aceptar el aviso, la cédula solo recibe el aviso: no hay fila, reto ni mensajes (invariante 3)', async () => {
    const before = await rowMap(pool);
    await say(NEW_CHAT, AFFILIATED);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].text).toBe(`${PRIVACY_NOTICE.title}\n\n${PRIVACY_NOTICE.body}\n\n${PRIVACY_NOTICE.declaration}`);
    const keyboard = (sent()[0].replyMarkup as { inline_keyboard: unknown[][] }).inline_keyboard.flat();
    expect(keyboard).toHaveLength(4);
    expect(await rowMap(pool)).toEqual(before);
    expect(await capturedMessages(pool)).toEqual([]);
  });

  it('1.6 pedir el código solo cambia el reto, los mensajes y conversation: nada del paciente se registra (R-29)', async () => {
    await acceptAs(A);
    const before = await rowMap(pool);
    await say(A, AFFILIATED);
    await waitForMessages(pool, 2);
    const diff = rowDiff(before, await rowMap(pool));
    expect(diff).toEqual({ 'app.otp_challenges': 1, 'app.captured_messages': 2 });
    for (const table of ['app.consent_records', 'app.patient_refs', 'app.channel_bindings', 'app.browser_devices']) {
      expect((await rowMap(pool))[table]).toBe(0);
    }
  });

  it('1.7 el reintento de Telegram con el mismo update_id no repite el trabajo', async () => {
    await acceptAs(A);
    const body = text(A, AFFILIATED, nextUpdateId());
    await post(body).expect(200);
    await post(body).expect(200);
    await sends.flush();
    expect(await challenges()).toHaveLength(1);
    expect(await waitForMessages(pool, 2)).toHaveLength(2);
    expect(sent().filter((c) => c.text === APPROVED)).toHaveLength(1);
  });

  it('1.8 todas las llamadas salientes del recorrido van al chat que escribió', async () => {
    await post(message(A));
    await post(press(A, 'accept:holder'));
    await say(A, AFFILIATED);
    expect(transport.calls.length).toBeGreaterThan(2);
    expect(transport.calls.every((c: RecordedCall) => c.chatId === A)).toBe(true);
  });

  it.each([
    ['ausente', null],
    ['distinto', 'otro-secreto'],
    ['vacío', ''],
  ])('1.9 la cédula con secreto %s responde 401 problem+json sin efectos', async (_n, secret) => {
    await acceptAs(A);
    const before = await rowMap(pool);
    const res = await post(text(A, AFFILIATED), secret);
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(transport.calls).toEqual([]);
    expect(await rowMap(pool)).toEqual(before);
  });
});

describe('paso 2: el código llega por SMS y correo', () => {
  it('2.1 llegan exactamente un SMS al celular y un correo al correo del afiliado', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED);
    await waitForMessages(pool, 2);
    await new Promise((r) => setTimeout(r, 300));
    const all = await capturedMessages(pool);
    expect(all).toHaveLength(2);
    expect(all.find((m) => m.channel === 'sms')!.destination).toBe(affiliate(AFFILIATED).mobilePhone);
    expect(all.find((m) => m.channel === 'email')!.destination).toBe(affiliate(AFFILIATED).email);
  });

  it('2.2 un afiliado sin correo recibe solo el SMS', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED_NO_EMAIL);
    await waitForMessages(pool, 1);
    await new Promise((r) => setTimeout(r, 300));
    const all = await capturedMessages(pool);
    expect(all.map((m) => m.channel)).toEqual(['sms']);
    expect(all[0].destination).toBe(affiliate(AFFILIATED_NO_EMAIL).mobilePhone);
  });

  const FORBIDDEN = ['Medicamento Ficticio A', 'Medicamento Ficticio B', 'Medicamento Ficticio C', 'Diagnóstico Ficticio X', 'Diagnóstico Ficticio Y'];
  const findForbidden = (value: string, extra: string[]) => [...FORBIDDEN, ...extra].filter((s) => value.toLowerCase().includes(s.toLowerCase()));

  it('2.3 ningún mensaje contiene medicamentos, diagnósticos, cédula ni el nombre (con control positivo)', async () => {
    const extra = [AFFILIATED, affiliate(AFFILIATED).fullName];
    expect(FORBIDDEN.length + extra.length).toBeGreaterThanOrEqual(5);
    expect(findForbidden('Recoja el medicamento ficticio a mañana', extra)).toEqual(['Medicamento Ficticio A']);
    await acceptAs(A);
    await say(A, AFFILIATED);
    for (const m of await waitForMessages(pool, 2)) expect(findForbidden(`${m.subject ?? ''} ${m.body}`, extra)).toEqual([]);
  });

  it('2.4 el código del SMS y el del correo son el mismo y cumplen ^[0-9]{6}$ en 20 pedidos', async () => {
    await acceptAs(A);
    for (let i = 0; i < 20; i++) {
      await pool.query('TRUNCATE app.captured_messages, app.otp_challenges');
      await post(message(A)); // /start vuelve a pedir la cédula
      await say(A, AFFILIATED);
      const msgs = await waitForMessages(pool, 2);
      const sms = msgs.find((m) => m.channel === 'sms')!;
      const email = msgs.find((m) => m.channel === 'email')!;
      expect(codeIn(sms.body)).toMatch(/^[0-9]{6}$/);
      expect(codeIn(email.body)).toBe(codeIn(sms.body));
    }
  });

  const ALLOWED = /^[A-Za-z0-9 .,:;\-()?!/]*$/;
  it('2.5 el SMS cumple las cuatro reglas, cada una por separado', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED);
    const sms = (await waitForSms(pool))!;
    expect(sms.body.startsWith('Pharma Express:')).toBe(true);
    expect(/\p{M}/u.test(sms.body.normalize('NFD'))).toBe(false);
    expect(ALLOWED.test(sms.body)).toBe(true);
    expect(sms.body.length).toBeLessThanOrEqual(160);
    expect(sms.body.match(/\b\d{6}\b/g)).toHaveLength(1);
  });

  it('2.6 el SMS y el correo coinciden carácter por carácter con las plantillas del anexo', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED);
    const msgs = await waitForMessages(pool, 2);
    const sms = msgs.find((m) => m.channel === 'sms')!;
    const email = msgs.find((m) => m.channel === 'email')!;
    const code = codeIn(sms.body);
    expect(sms.body).toBe(SMS(code));
    expect(email.subject).toBe(EMAIL_SUBJECT);
    expect(email.body).toBe(EMAIL_BODY(code));
    expect(email.body.split(code)).toHaveLength(2);
  });

  it('2.7 los mensajes pedidos desde el bot son los mismos que los de la web, salvo el código', async () => {
    const accepted = await acceptNotice(app);
    await requestCode(app, accepted.cookie, AFFILIATED);
    const fromWeb = (await waitForMessages(pool, 2)).map((m) => ({ ...m, body: m.body.replace(codeIn(m.body), '{code}') }));
    await pool.query('TRUNCATE app.captured_messages, app.otp_challenges');
    await acceptAs(A);
    await say(A, AFFILIATED);
    const fromBot = (await waitForMessages(pool, 2)).map((m) => ({ ...m, body: m.body.replace(codeIn(m.body), '{code}') }));
    const key = (m: { channel: string }) => m.channel;
    expect(fromBot.sort((x, y) => key(x).localeCompare(key(y)))).toEqual(fromWeb.sort((x, y) => key(x).localeCompare(key(y))));
  });
});

describe('paso 6: el mensaje aprobado', () => {
  it('6.1 la cédula afiliada recibe exactamente un sendMessage con el mensaje aprobado y sin teclado', async () => {
    await acceptAs(A);
    await say(A, AFFILIATED);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('sendMessage');
    expect(transport.calls[0].chatId).toBe(A);
    expect(transport.calls[0].text).toBe(APPROVED);
    expect(transport.calls[0].replyMarkup).toBeUndefined();
  });

  it('6.2 la respuesta del webhook es 200 sin cuerpo y tarda menos de 3000 ms', async () => {
    await acceptAs(A);
    const t0 = performance.now();
    const res = await post(text(A, AFFILIATED));
    const elapsed = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(elapsed).toBeLessThan(3000);
  });

  it('6.3 si falla el servicio que crea el reto: "No pudimos enviar el código", sin reto, sin cambio de paso y sin mensajes', async () => {
    await acceptAs(A);
    vi.spyOn(app.get(IdentityService), 'requestCode').mockRejectedValueOnce(new Error('falla forzada'));
    const res = await say(A, AFFILIATED);
    expect(res.status).toBe(200);
    expect(sent().map((c) => c.text)).toEqual([CODE_NOT_SENT]);
    expect(await challenges()).toEqual([]);
    expect((await conversation(A)).step).toBe('awaiting_cedula');
    await new Promise((r) => setTimeout(r, 300));
    expect(await capturedMessages(pool)).toEqual([]);
  });

  it.each([['server' as const], ['network' as const]])(
    '6.4 si Telegram falla (%s) al enviar el mensaje aprobado, el webhook responde 200 y el SMS y el correo se envían',
    async (kind) => {
      await acceptAs(A);
      transport.failWith(kind);
      const res = await say(A, AFFILIATED);
      expect(res.status).toBe(200);
      expect(await waitForMessages(pool, 2)).toHaveLength(2);
    },
  );
});

describe('paso 7: cédula que no existe', () => {
  it('7.1 la cédula inexistente recibe el mismo mensaje, en un solo sendMessage y sin teclado', async () => {
    await acceptAs(A);
    await say(A, UNKNOWN);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('sendMessage');
    expect(transport.calls[0].text).toBe(APPROVED);
    expect(transport.calls[0].replyMarkup).toBeUndefined();
  });

  it('7.2 no llega ningún SMS ni correo en 3 s', async () => {
    await acceptAs(A);
    await say(A, UNKNOWN);
    await new Promise((r) => setTimeout(r, 3000));
    expect(await capturedMessages(pool)).toEqual([]);
  });

  it('7.3 no se crea cuenta: solo un reto sin código con la huella de la cédula', async () => {
    await acceptAs(A);
    const before = await rowMap(pool);
    await say(A, UNKNOWN);
    expect(rowDiff(before, await rowMap(pool))).toEqual({ 'app.otp_challenges': 1 });
    const rows = await challenges();
    expect(rows[0].code_hash).toBeNull();
    expect(rows[0].cedula_fingerprint).toBe(fingerprintOf(UNKNOWN));
  });

  it('7.4 la afiliada, la inexistente y la inactiva producen las mismas llamadas', async () => {
    await acceptAs(A);
    const serialized: string[] = [];
    for (const cedula of [AFFILIATED, UNKNOWN, AFFILIATED_INACTIVE]) {
      transport.calls.length = 0;
      await post(message(A)); // /start: vuelve a pedir la cédula
      transport.calls.length = 0;
      await say(A, cedula);
      serialized.push(JSON.stringify(transport.calls.map((c) => ({ ...c, chatId: c.chatId === A ? '<chat>' : c.chatId }))));
    }
    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[0]).toBe(serialized[2]);
  });

  it('7.5 el tiempo de respuesta no distingue los dos casos (mediana de la diferencia menor que 200 ms)', async () => {
    await acceptAs(A);
    const times: Record<'known' | 'unknown', number[]> = { known: [], unknown: [] };
    for (let i = 0; i < 20; i++) {
      const kind = i % 2 === 0 ? 'known' : 'unknown';
      const cedula = kind === 'unknown' ? UNKNOWN : i % 4 === 0 ? AFFILIATED : AFFILIATED_NO_EMAIL;
      await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
      await post(message(A));
      const t0 = performance.now();
      const res = await post(text(A, cedula));
      times[kind].push(performance.now() - t0);
      expect(res.status).toBe(200);
      await sends.flush();
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(times.known).toHaveLength(10);
    expect(median(times.known) - median(times.unknown)).toBeLessThan(200);
  });

  it('7.6 ninguna llamada ni mensaje de los pasos 6 y 7 revela nombre, celular, correo ni afiliación', async () => {
    const a = affiliate(AFFILIATED);
    await acceptAs(A);
    const calls: string[] = [];
    for (const cedula of [AFFILIATED, UNKNOWN, AFFILIATED_INACTIVE]) {
      await post(message(A));
      await say(A, cedula);
    }
    calls.push(...transport.calls.map((c) => c.text ?? ''));
    const bodies = (await waitForMessages(pool, 2)).map((m) => `${m.subject ?? ''} ${m.body}`);
    const revealing = [a.fullName, a.mobilePhone, a.mobilePhone.slice(-4), a.email!, 'example.invalid', 'salud_total'];
    for (const value of [...calls, ...bodies]) for (const secret of revealing) expect(value).not.toContain(secret);
  });
});
