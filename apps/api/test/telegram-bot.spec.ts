import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../src/common/clock';
import { createPool } from '../src/db/client';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT } from '../src/modules/telegram/telegram-transport';
import { createTestApp } from './support/app';
import { countRows } from './support/db';

// F002: bot de Telegram, aviso de privacidad (contracts/F002.md). Las actualizaciones son objetos Update
// simulados con identificadores ficticios; nunca se llama a Telegram (modo capture).

// Cadenas exactas del anexo de T.1, escritas aquí a propósito: la prueba no las toma del código.
const ASK_CEDULA = 'Gracias. Escriba la cédula del paciente. La cédula se usa solo para verificar la identidad y atender la solicitud.';
const REJECTED = 'Sin aceptar el aviso no podemos continuar por Telegram. Puede acudir a la atención presencial.';
const REVOKE_PLACEHOLDER = 'Esta opción estará disponible próximamente.';
const WEBHOOK = '/api/v1/telegram/webhook';
const CEDULA = '1000000001';
const CEDULA_DETECTOR = /\b\d{6,10}\b/;

const A = 900000001;
const B = 900000002;
let updateSeq = 700000000;
const nextUpdateId = () => ++updateSeq;

const user = (id: number) => ({ id, is_bot: false, first_name: 'Prueba Uno', username: 'prueba_uno' });
const chat = (id: number) => ({ id, type: 'private', first_name: 'Prueba Uno', username: 'prueba_uno' });
const message = (id: number, extra: Record<string, unknown> = { text: '/start' }, updateId = nextUpdateId()) => ({
  update_id: updateId,
  message: { message_id: 1, date: 1700000000, chat: chat(id), from: user(id), ...extra },
});
const press = (id: number, data: string, updateId = nextUpdateId()) => ({
  update_id: updateId,
  callback_query: {
    id: `cb-${updateId}`,
    from: user(id),
    chat_instance: 'ci',
    data,
    message: { message_id: 2, date: 1700000000, chat: chat(id), text: 'aviso' },
  },
});

const lines: string[] = [];
const sink: LoggerService = {
  log: (m) => lines.push(String(m)),
  error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
  warn: (m) => lines.push(String(m)),
  debug: (m) => lines.push(String(m)),
  verbose: (m) => lines.push(String(m)),
};

/** Ejecuta `fn` y devuelve todo lo que la API escribió en logs y en la salida estándar. */
async function captureLogs(fn: () => Promise<void>): Promise<string> {
  lines.length = 0;
  const out: string[] = [];
  const spies = [process.stdout, process.stderr].map((s) =>
    vi.spyOn(s, 'write').mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as never),
  );
  try {
    await fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return [...lines, ...out].join('\n');
}

describe('bot de Telegram (F002)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let transport: CaptureTelegramTransport;

  // `secret` omitido usa el secreto de pruebas; `null` no envía la cabecera.
  const post = (update: unknown, secret: string | null = process.env.TELEGRAM_WEBHOOK_SECRET!) => {
    const req = request(app.getHttpServer()).post(WEBHOOK);
    return (secret === null ? req : req.set('X-Telegram-Bot-Api-Secret-Token', secret)).send(update as object);
  };
  const sent = () => transport.calls.filter((c) => c.method === 'sendMessage');
  const rowsOf = async (chatId: number) =>
    (await pool.query('SELECT * FROM telegram_chats WHERE chat_id = $1', [chatId])).rows;
  const setOffset = (seconds: number) => pool.query('UPDATE app.test_clock SET offset_seconds = $1', [seconds]);

  beforeAll(async () => {
    pool = createPool();
    app = await createTestApp({ logger: sink });
    transport = app.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
  });
  beforeEach(async () => {
    transport.reset();
    await pool.query('DELETE FROM telegram_chats');
  });
  afterEach(async () => {
    await setOffset(0);
    process.env.TELEGRAM_WEBHOOK_SECRET = secretBackup;
  });
  afterAll(async () => {
    await pool.query('DELETE FROM telegram_chats');
    await app.close();
    await pool.end();
  });
  const secretBackup = process.env.TELEGRAM_WEBHOOK_SECRET;

  describe('paso 1: un chat nuevo no recibe nada si no escribe primero', () => {
    it('1.1 el arranque no envía mensajes y no hay fila del chat', async () => {
      const fresh = await createTestApp();
      try {
        expect(fresh.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT).calls).toEqual([]);
        expect(await rowsOf(A)).toHaveLength(0);
      } finally {
        await fresh.close();
      }
    });

    it('1.2 todas las llamadas salientes van al chat que escribió; nunca al que dice ser otro con secreto incorrecto', async () => {
      await post(message(A, { text: '/start' })).expect(200);
      await post(press(A, 'reject')).expect(200);
      await post(message(B, { text: '/start' }), 'secreto-incorrecto').expect(401);
      await post(press(B, 'accept:holder'), 'secreto-incorrecto').expect(401);
      expect(transport.calls.length).toBeGreaterThan(0);
      expect(transport.calls.every((c) => c.chatId === A)).toBe(true);
      expect(await rowsOf(B)).toHaveLength(0);
    });

    it.each([
      ['my_chat_member', { my_chat_member: { chat: chat(A), from: user(A), date: 1, old_chat_member: {}, new_chat_member: {} } }],
      ['edited_message', { edited_message: { message_id: 1, date: 1, chat: chat(A), from: user(A), text: 'hola' } }],
      ['channel_post', { channel_post: { message_id: 1, date: 1, chat: { id: A, type: 'channel' }, text: 'hola' } }],
      ['sin message ni callback_query', {}],
    ])('1.3 una actualización %s de un chat nuevo responde 200 sin enviar nada', async (_n, extra) => {
      const res = await post({ update_id: nextUpdateId(), ...extra });
      expect(res.status).toBe(200);
      expect(transport.calls).toEqual([]);
      expect(await rowsOf(A)).toHaveLength(0);
    });

    it.each([
      ['sin cabecera', null],
      ['secreto distinto', 'otro-secreto'],
      ['secreto vacío', ''],
      ['secreto de otra longitud', `${process.env.TELEGRAM_WEBHOOK_SECRET}x`],
    ])('1.4 %s responde 401 problem+json, sin llamadas ni filas nuevas', async (_n, secret) => {
      const before = await countRows(pool);
      const res = await post(message(A), secret);
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(transport.calls).toEqual([]);
      expect(await countRows(pool)).toEqual(before);
    });

    it('1.5 sin TELEGRAM_WEBHOOK_SECRET configurado, toda petición responde 401', async () => {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      const withHeader = await post(message(A), secret);
      const empty = await post(message(A), '');
      const without = await post(message(A), null);
      expect([withHeader.status, empty.status, without.status]).toEqual([401, 401, 401]);
      expect(transport.calls).toEqual([]);
    });
  });

  describe('paso 2: iniciar el bot muestra el aviso, sin cédula', () => {
    it('2.1 /start responde con el aviso completo, sin Origin, en un solo mensaje de 4096 caracteres o menos', async () => {
      const res = await post(message(A));
      expect(res.status).toBe(200);
      expect(sent()).toHaveLength(1);
      const text = sent()[0].text!;
      expect(text).toContain(PRIVACY_NOTICE.title);
      expect(text).toContain(PRIVACY_NOTICE.body);
      expect(text).toContain('Soy el titular o actúo con su autorización');
      expect(text).toContain(PRIVACY_NOTICE.declaration);
      expect(text.length).toBeLessThanOrEqual(4096);
    });

    it('2.2 el aviso es lo único que se envía y no contiene la cadena que pide la cédula', async () => {
      await post(message(A));
      expect(transport.calls).toHaveLength(1);
      expect(sent()[0].text!.includes(ASK_CEDULA)).toBe(false);
    });

    it('2.3 el teclado tiene cuatro botones con textos y callback_data exactos', async () => {
      await post(message(A));
      const keyboard = (sent()[0].replyMarkup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard.flat();
      expect(keyboard.map((b) => [b.text, b.callback_data])).toEqual([
        ['Acepto como titular', 'accept:holder'],
        ['Acepto, actúo con su autorización', 'accept:third_party'],
        ['No acepto', 'reject'],
        ['Revocar mi autorización', 'revoke'],
      ]);
      for (const b of keyboard) {
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
        expect(b.callback_data).not.toMatch(/\d{4,}/);
      }
    });

    it.each([
      ['texto', { text: 'hola' }],
      ['foto', { photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 10, height: 10 }] }],
      ['documento', { document: { file_id: 'f2', file_unique_id: 'u2' } }],
    ])('2.4 el primer mensaje (%s) de un chat nuevo responde solo con el aviso y no guarda nada', async (_n, extra) => {
      const before = await countRows(pool);
      const res = await post(message(A, extra));
      expect(res.status).toBe(200);
      expect(sent()).toHaveLength(1);
      expect(sent()[0].text).toContain(PRIVACY_NOTICE.title);
      expect(sent()[0].text!.includes(ASK_CEDULA)).toBe(false);
      expect(transport.calls.some((c) => c.method === 'getFile')).toBe(false);
      expect(await countRows(pool)).toEqual(before);
    });

    it('2.5 un número de diez dígitos antes de aceptar no se procesa como cédula ni aparece en logs', async () => {
      const before = await countRows(pool);
      const logs = await captureLogs(async () => {
        await post(message(A, { text: CEDULA })).expect(200);
      });
      expect(sent()).toHaveLength(1);
      expect(sent()[0].text).toContain(PRIVACY_NOTICE.title);
      expect(await countRows(pool)).toEqual(before);
      expect(logs).not.toContain(CEDULA);
    });

    it('2.6 el aviso trae "Revocar mi autorización" (revoke) sin que exista fila del chat', async () => {
      await post(message(A));
      const buttons = (sent()[0].replyMarkup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard.flat();
      expect(buttons).toContainEqual({ text: 'Revocar mi autorización', callback_data: 'revoke' });
      expect(await rowsOf(A)).toHaveLength(0);
    });

    it('2.7 /start se atiende en menos de 3000 ms con 200', async () => {
      const t0 = performance.now();
      const res = await post(message(A));
      expect(res.status).toBe(200);
      expect(performance.now() - t0).toBeLessThan(3000);
    });
  });

  describe('paso 3: rechazar', () => {
    it('3.1 "No acepto" envía el mensaje de atención presencial y no pide cédula', async () => {
      await post(message(A));
      transport.calls.length = 0;
      const res = await post(press(A, 'reject'));
      expect(res.status).toBe(200);
      expect(sent().map((c) => c.text)).toEqual([REJECTED]);
      expect(REJECTED).toContain('atención presencial');
    });

    it('3.2 ver el aviso y rechazarlo deja igual el conteo de filas de todas las tablas', async () => {
      const before = await countRows(pool);
      await post(message(A));
      await post(press(A, 'reject'));
      const after = await countRows(pool);
      console.log('Filas por tabla (antes y después de rechazar):', JSON.stringify({ before, after }));
      expect(after).toEqual(before);
      expect(await rowsOf(A)).toHaveLength(0);
    });

    it('3.3 "No acepto" dos veces, o sin haber enviado /start, deja el conteo igual', async () => {
      const before = await countRows(pool);
      await post(press(A, 'reject')).expect(200);
      await post(message(B));
      await post(press(B, 'reject')).expect(200);
      await post(press(B, 'reject')).expect(200);
      expect(await countRows(pool)).toEqual(before);
    });

    it('3.4 "Revocar mi autorización" sin aceptar responde el marcador y no crea nada', async () => {
      const before = await countRows(pool);
      const res = await post(press(A, 'revoke'));
      expect(res.status).toBe(200);
      expect(sent().map((c) => c.text)).toEqual([REVOKE_PLACEHOLDER]);
      expect(await countRows(pool)).toEqual(before);
    });

    it('3.5 si Telegram falla al responder el rechazo, el webhook responde 200 y no queda registro', async () => {
      const before = await countRows(pool);
      for (const kind of ['server', 'network'] as const) {
        transport.failWith(kind);
        const res = await post(press(A, 'reject'));
        expect(res.status).toBe(200);
      }
      expect(await countRows(pool)).toEqual(before);
    });
  });

  describe('paso 4: iniciar de nuevo y aceptar', () => {
    it('4.1 tras rechazar, otro /start vuelve a mostrar el aviso completo sin mencionar el rechazo', async () => {
      await post(message(A));
      await post(press(A, 'reject'));
      transport.calls.length = 0;
      await post(message(A));
      expect(sent()).toHaveLength(1);
      expect(sent()[0].text).toContain(PRIVACY_NOTICE.body);
      expect(sent()[0].text!.includes(REJECTED)).toBe(false);
      expect((sent()[0].replyMarkup as { inline_keyboard: unknown[][] }).inline_keyboard.flat()).toHaveLength(4);
      expect(await rowsOf(A)).toHaveLength(0);
    });

    it('4.2 accept:holder crea una fila con el paso, la versión, el declarante y la fecha, sin datos del perfil', async () => {
      const res = await post(press(A, 'accept:holder'));
      expect(res.status).toBe(200);
      const rows = await rowsOf(A);
      expect(rows).toHaveLength(1);
      const conversation = rows[0].conversation;
      expect(Object.keys(conversation).sort()).toEqual(['pendingAcceptance', 'step']);
      expect(conversation.step).toBe('awaiting_cedula');
      expect(Object.keys(conversation.pendingAcceptance).sort()).toEqual(['acceptedAt', 'declarant', 'noticeVersion']);
      expect(conversation.pendingAcceptance.noticeVersion).toBe(PRIVACY_NOTICE.version);
      expect(conversation.pendingAcceptance.declarant).toBe('holder');
      expect(Number.isNaN(Date.parse(conversation.pendingAcceptance.acceptedAt))).toBe(false);
      const serialized = JSON.stringify(rows[0]);
      for (const forbidden of ['Prueba Uno', 'prueba_uno', CEDULA]) expect(serialized).not.toContain(forbidden);
    });

    it('4.3 la fecha es la del reloj de la aplicación al pulsar, no la de un paso posterior', async () => {
      await setOffset(86400);
      const { rows } = await pool.query<{ h: Date }>('SELECT app.clock_now() AS h');
      const h = rows[0].h.getTime();
      await post(press(A, 'accept:holder')).expect(200);
      await setOffset(3 * 86400);
      const saved = Date.parse((await rowsOf(A))[0].conversation.pendingAcceptance.acceptedAt);
      // app.clock_now() avanza con el tiempo real: se tolera el tiempo de la propia prueba.
      expect(saved).toBeGreaterThanOrEqual(h);
      expect(saved - h).toBeLessThan(5000);
      expect(Date.now() + 2 * 86400 * 1000).toBeLessThan(saved + 3 * 86400 * 1000 + 1);
    });

    it('4.3 con un reloj fijo, la fecha guardada es exactamente la del reloj (no Date.now ni la cabecera date)', async () => {
      const fixed = new Date('2030-03-04T10:00:00.000Z');
      const clock: Clock = { now: async () => fixed };
      const own = await createTestApp({ clock });
      try {
        await request(own.getHttpServer())
          .post(WEBHOOK)
          .set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!)
          .send({ ...press(A, 'accept:holder'), callback_query: { ...press(A, 'accept:holder').callback_query, message: { message_id: 2, date: 946684800, chat: chat(A) } } })
          .expect(200);
        expect((await rowsOf(A))[0].conversation.pendingAcceptance.acceptedAt).toBe(fixed.toISOString());
      } finally {
        await own.close();
      }
    });

    it('4.4 accept:third_party en otro chat guarda el declarante third_party', async () => {
      await post(press(A, 'accept:holder'));
      await post(press(B, 'accept:third_party')).expect(200);
      expect((await rowsOf(B))[0].conversation.pendingAcceptance.declarant).toBe('third_party');
      expect((await rowsOf(A))[0].conversation.pendingAcceptance.declarant).toBe('holder');
    });

    it('4.5 aceptar solo agrega una fila a telegram_chats y ninguna a otra tabla', async () => {
      const before = await countRows(pool);
      await post(message(A));
      await post(press(A, 'accept:holder'));
      const after = await countRows(pool);
      expect(after).toEqual({ ...before, telegram_chats: before.telegram_chats + 1 });
      for (const t of ['consent_records', 'channel_bindings', 'patient_refs']) expect(after[t] ?? 0).toBe(0);
    });

    it('4.6 aceptar dos veces (otra actualización o la misma) no cambia la fila original', async () => {
      const sameId = nextUpdateId();
      await post(press(A, 'accept:holder', sameId)).expect(200);
      const original = (await rowsOf(A))[0];
      await setOffset(7200);
      await post(press(A, 'accept:third_party')).expect(200);
      await post(press(A, 'accept:holder', sameId)).expect(200);
      const rows = await rowsOf(A);
      expect(rows).toHaveLength(1);
      expect(rows[0].conversation).toEqual(original.conversation);
      expect(sent().filter((c) => c.text === ASK_CEDULA)).toHaveLength(1);
    });

    it.each([['accept:admin'], ['accept:holder '], ['ACCEPT:HOLDER'], ['accept:'], ['x'.repeat(200)], ['']])(
      '4.7 un callback_data desconocido (%j) no crea fila ni pide cédula',
      async (data) => {
        const res = await post(press(A, data));
        expect(res.status).toBe(200);
        expect(await rowsOf(A)).toHaveLength(0);
        expect(sent().some((c) => c.text === ASK_CEDULA)).toBe(false);
      },
    );

    it('4.7 aceptar es válido aunque el chat no haya visto el aviso en la prueba', async () => {
      await post(press(A, 'accept:third_party')).expect(200);
      expect(await rowsOf(A)).toHaveLength(1);
    });

    it('4.8 tras aceptar, el bot solo envió el mensaje de la cédula y no muestra datos de pacientes', async () => {
      await post(press(A, 'accept:holder'));
      await post(message(A, { text: 'hola' }));
      await post(message(A, { text: 'mis medicamentos' }));
      expect(transport.calls.map((c) => [c.method, c.text])).toEqual([['sendMessage', ASK_CEDULA]]);
    });

    it('4.9 si Telegram falla al responder la aceptación, la fila queda una vez y el reintento no la duplica', async () => {
      transport.failWith('server');
      const id = nextUpdateId();
      await post(press(A, 'accept:holder', id)).expect(200);
      await post(press(A, 'accept:holder', id)).expect(200);
      expect(await rowsOf(A)).toHaveLength(1);
      expect(sent()).toHaveLength(1);
    });

    it('4.10 dos aceptaciones simultáneas del mismo chat dejan una fila, una fecha y un solo mensaje de cédula', async () => {
      const [r1, r2] = await Promise.all([post(press(A, 'accept:holder')), post(press(A, 'accept:third_party'))]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      const count = await pool.query('SELECT count(*)::int AS n FROM telegram_chats WHERE chat_id = $1', [A]);
      expect(count.rows[0].n).toBe(1);
      const row = (await rowsOf(A))[0];
      expect(['holder', 'third_party']).toContain(row.conversation.pendingAcceptance.declarant);
      const { rows } = await pool.query<{ now: Date }>('SELECT app.clock_now() AS now');
      const accepted = Date.parse(row.conversation.pendingAcceptance.acceptedAt);
      expect(Math.abs(rows[0].now.getTime() - accepted)).toBeLessThan(5000);
      expect(row.updated_at.getTime()).toBe(accepted);
      expect(sent().filter((c) => c.text === ASK_CEDULA)).toHaveLength(1);
    });
  });

  describe('paso 5: solo después de aceptar se pide la cédula', () => {
    it('5.1 la cédula se pide inmediatamente después de aceptar y nunca antes', async () => {
      await post(message(A));
      expect(sent().map((c) => c.text)).not.toContain(ASK_CEDULA);
      const beforeAccept = transport.calls.length;
      await post(press(A, 'accept:holder'));
      expect(transport.calls).toHaveLength(beforeAccept + 1);
      expect(transport.calls[beforeAccept].text).toBe(ASK_CEDULA);
      expect(transport.calls[beforeAccept].chatId).toBe(A);
    });

    it('5.1 aceptar como tercero también pide la cédula', async () => {
      await post(press(B, 'accept:third_party'));
      expect(sent().map((c) => c.text)).toEqual([ASK_CEDULA]);
    });

    it('5.2 en toda la secuencia previa a aceptar ninguna llamada contiene la cadena que pide la cédula', async () => {
      await post(message(A));
      await post(message(A, { text: 'hola' }));
      await post(message(A, { text: CEDULA }));
      await post(press(A, 'reject'));
      await post(press(A, 'revoke'));
      await post(message(A));
      expect(transport.calls.length).toBeGreaterThan(0);
      expect(transport.calls.filter((c) => (c.text ?? '').includes(ASK_CEDULA))).toEqual([]);
    });

    it('5.3 la cédula escrita por un chat que ya aceptó no se guarda, no genera llamadas y no está en logs', async () => {
      await post(press(A, 'accept:holder'));
      const before = (await rowsOf(A))[0];
      const callsBefore = transport.calls.length;
      const logs = await captureLogs(async () => {
        await post(message(A, { text: CEDULA })).expect(200);
      });
      expect((await rowsOf(A))[0]).toEqual(before);
      expect(transport.calls).toHaveLength(callsBefore);
      expect(transport.calls.every((c) => c.method === 'sendMessage')).toBe(true);
      expect(logs).not.toContain(CEDULA);
      expect(JSON.stringify(await rowsOf(A))).not.toContain(CEDULA);
    });

    it('5.4 un chat que aceptó y escribe /start recibe de nuevo la cédula, sin otra fila ni cambio de fecha', async () => {
      await post(press(A, 'accept:holder'));
      const original = (await rowsOf(A))[0].conversation;
      await setOffset(3600);
      transport.calls.length = 0;
      await post(message(A)).expect(200);
      expect(sent().map((c) => c.text)).toEqual([ASK_CEDULA]);
      const rows = await rowsOf(A);
      expect(rows).toHaveLength(1);
      expect(rows[0].conversation).toEqual(original);
    });
  });

  describe('transversales', () => {
    it('T.1 los textos coinciden con las cadenas exactas del anexo', async () => {
      await post(message(A));
      expect(PRIVACY_NOTICE.title).toBe('Aviso de privacidad y tratamiento de datos personales');
      expect(sent()[0].text).toBe(`${PRIVACY_NOTICE.title}\n\n${PRIVACY_NOTICE.body}\n\n${PRIVACY_NOTICE.declaration}`);
      await post(press(A, 'reject'));
      await post(press(A, 'revoke'));
      await post(press(A, 'accept:holder'));
      expect(sent().slice(1).map((c) => c.text)).toEqual([REJECTED, REVOKE_PLACEHOLDER, ASK_CEDULA]);
    });

    it.each([
      ['respuesta 200', () => post(message(A))],
      ['respuesta 401', () => post(message(A), 'incorrecto')],
    ])('T.3 la %s lleva nosniff y Content-Security-Policy', async (_n, send) => {
      const res = await send();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeTruthy();
    });

    it.each([
      ['sin update_id', () => post({ message: { text: 'hola' } })],
      ['update_id no numérico', () => post({ update_id: 'x' })],
      ['arreglo', () => post([])],
      ['JSON roto', () => request(app.getHttpServer()).post(WEBHOOK).set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!).set('Content-Type', 'application/json').send('{"update_id":')],
      ['texto suelto', () => request(app.getHttpServer()).post(WEBHOOK).set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!).set('Content-Type', 'application/json').send('"hola"')],
    ])('T.4 un cuerpo no válido (%s) con secreto correcto responde 200 sin efectos ni datos internos', async (_n, send) => {
      const before = await countRows(pool);
      const res = await send();
      expect(res.status).toBe(200);
      expect(res.status).not.toBe(400);
      expect(JSON.stringify(res.body) + res.text).not.toMatch(/Error|Exception|stack|\bat \w|\.ts|node_modules/);
      expect(transport.calls).toEqual([]);
      expect(await countRows(pool)).toEqual(before);
    });

    it('T.4 un JSON roto con secreto incorrecto responde 401', async () => {
      const res = await request(app.getHttpServer())
        .post(WEBHOOK)
        .set('X-Telegram-Bot-Api-Secret-Token', 'incorrecto')
        .set('Content-Type', 'application/json')
        .send('{"update_id":');
      expect(res.status).toBe(401);
    });
  });

  describe('registros (invariante 8)', () => {
    it('6.1 el recorrido completo no deja cédulas, identificadores ni texto de usuarios en los logs', async () => {
      expect(CEDULA_DETECTOR.test('usuario 1000000001 consulta')).toBe(true); // control positivo
      const logs = await captureLogs(async () => {
        await post(message(A));
        await post(message(A, { text: CEDULA }));
        await post(press(A, 'reject'));
        await post(press(A, 'revoke'));
        await post(message(A));
        await post(press(A, 'accept:holder'));
        await post(message(A, { text: CEDULA }));
        await post(message(A));
        await post({ update_id: 'x' });
        await post(message(B), 'incorrecto');
        transport.failWith('server', 'fallo con 1000000001');
        await post(press(B, 'accept:holder'));
        await request(app.getHttpServer()).post(WEBHOOK).set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!).set('Content-Type', 'application/json').send('{"update_id":');
      });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).not.toMatch(CEDULA_DETECTOR);
      expect(logs).not.toContain('hola');
    });

    it('6.2 los errores del adaptador registrados no incluyen el token ni el secreto', async () => {
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET!;
      const logs = await captureLogs(async () => {
        for (const kind of ['server', 'network'] as const) {
          transport.failWith(kind, `fallo https://api.telegram.org/bot${token}/sendMessage con ${secret}`);
          await post(message(A)).expect(200);
        }
      });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).not.toContain(token);
      expect(logs).not.toContain(secret);
    });
  });
});
