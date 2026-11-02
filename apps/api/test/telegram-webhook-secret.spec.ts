import { Logger, type LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/db/client.js';
import { CaptureTelegramTransport, TELEGRAM_TRANSPORT } from '../src/modules/telegram/telegram-transport.js';
import { createTestApp } from './support/app.js';
import { countAllRows } from './support/identity.js';

// F007: el webhook solo procesa peticiones con el secreto correcto (contracts/F007.md).
// Solo cubre los huecos que F002 y F006 no probaron. Todo con datos ficticios.

const WEBHOOK = '/api/v1/telegram/webhook';
const HEADER = 'X-Telegram-Bot-Api-Secret-Token';
const A = 900000001;
let seq = 710000000;
const nextId = () => ++seq;

const user = (id: number) => ({ id, is_bot: false, first_name: 'Prueba Uno' });
const chat = (id: number) => ({ id, type: 'private', first_name: 'Prueba Uno' });
const start = (id: number, extra: Record<string, unknown> = {}) => ({
  update_id: nextId(),
  message: { message_id: 1, date: 1700000000, chat: chat(id), from: user(id), text: '/start' },
  ...extra,
});
const accept = (id: number) => {
  const updateId = nextId();
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: user(id),
      chat_instance: 'ci',
      data: 'accept:holder',
      message: { message_id: 2, date: 1700000000, chat: chat(id), text: 'aviso' },
    },
  };
};

const lines: string[] = [];
const sink: LoggerService = {
  log: (m) => lines.push(String(m)),
  error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
  warn: (m) => lines.push(String(m)),
  debug: (m) => lines.push(String(m)),
  verbose: (m) => lines.push(String(m)),
};

describe('secreto del webhook de Telegram (F007)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let transport: CaptureTelegramTransport;
  const secretBackup = process.env.TELEGRAM_WEBHOOK_SECRET!;
  const good = () => process.env.TELEGRAM_WEBHOOK_SECRET!;

  const post = (update: unknown, secret: string | null = good()) => {
    const req = request(app.getHttpServer()).post(WEBHOOK);
    return (secret === null ? req : req.set(HEADER, secret)).send(update as object);
  };
  const clean = async () => {
    transport.reset();
    await pool.query('DELETE FROM telegram_chats');
    await pool.query('TRUNCATE app.captured_messages');
  };
  /** Comprueba "sin efectos": cero llamadas salientes y cero filas nuevas en todas las tablas. */
  const expectNoEffects = async (before: Record<string, number>) => {
    expect(transport.calls).toEqual([]);
    expect(await countAllRows(pool)).toEqual(before);
  };

  beforeAll(async () => {
    pool = createPool();
    app = await createTestApp({ logger: sink });
    transport = app.get<CaptureTelegramTransport>(TELEGRAM_TRANSPORT);
  });
  beforeEach(clean);
  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secretBackup;
  });
  afterAll(async () => {
    await clean();
    await app.close();
    await pool.end();
  });

  describe('paso 1: sin el secreto no se procesa nada', () => {
    it('1.3 con secreto incorrecto o ausente el /start y el botón aceptar no dejan filas ni llamadas; con el correcto, el mismo /start responde', async () => {
      const before = await countAllRows(pool);
      for (const secret of [null, 'secreto-incorrecto']) {
        await post(start(A), secret).expect(401);
        await post(accept(A), secret).expect(401);
        await expectNoEffects(before);
        expect((await pool.query('SELECT 1 FROM telegram_chats WHERE chat_id = $1', [A])).rowCount).toBe(0);
      }
      // Control positivo: el chat no tiene fila y el secreto correcto sí abre el camino.
      await clean();
      await post(start(A)).expect(200);
      expect(transport.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1);
      // La fila mínima nace al aceptar el aviso (F002): con el secreto correcto el botón sí la crea.
      await post(accept(A)).expect(200);
      expect((await pool.query('SELECT 1 FROM telegram_chats WHERE chat_id = $1', [A])).rowCount).toBe(1);
    });

    it('1.4 el cuerpo del 401 no revela el secreto ni la causa: es el mismo ausente, incorrecto o sin configurar', async () => {
      const secret = good();
      const wrong = 'valor-enviado-incorrecto';
      const absent = await post(start(A), null).expect(401);
      const incorrect = await post(start(A), wrong).expect(401);
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      const unset = await post(start(A), wrong).expect(401);
      for (const res of [absent, incorrect, unset]) {
        expect(res.headers['content-type']).toContain('application/problem+json');
        expect(res.body.status).toBe(401);
        expect(res.body).toHaveProperty('type');
        expect(res.body).toHaveProperty('title');
        expect(res.body).not.toHaveProperty('detail');
        expect(res.text).not.toContain(secret);
        expect(res.text).not.toContain(wrong);
      }
      expect(incorrect.body).toEqual(absent.body);
      expect(unset.body).toEqual(absent.body);
    });

    describe('1.5 casos límite de la cabecera', () => {
      const variants: Array<[string, (s: string) => string]> = [
        ['mayúsculas', (s) => s.toUpperCase()],
        ['solo el prefijo', (s) => s.slice(0, Math.ceil(s.length / 2))],
        ['un carácter adicional al final', (s) => `${s}x`],
        ['un guion adicional dentro del valor', (s) => `${s.slice(0, 3)}-${s.slice(3)}`],
      ];
      it.each(variants)('%s responde 401 sin efectos', async (_n, make) => {
        const secret = good();
        const given = make(secret);
        // Si la variante coincidiera con el secreto (p. ej. secreto ya en mayúsculas) la prueba no sería válida.
        expect(given).not.toBe(secret);
        const before = await countAllRows(pool);
        await post(start(A), given).expect(401);
        await expectNoEffects(before);
      });

      it('el nombre de la cabecera en minúsculas responde 200', async () => {
        await request(app.getHttpServer())
          .post(WEBHOOK)
          .set('x-telegram-bot-api-secret-token', good())
          .send(start(A))
          .expect(200);
      });

      describe('cabecera repetida con node:http (dos líneas)', () => {
        // Servidor propio sobre la misma aplicación Express: registra las líneas de cabecera que llegan.
        let server: Server;
        let port: number;
        let received: string[][] = [];
        beforeAll(async () => {
          const handler = app.getHttpAdapter().getInstance();
          server = createServer((req: IncomingMessage, res: ServerResponse) => {
            received.push(req.rawHeaders.filter((_v, i) => i % 2 === 0).map((h) => h.toLowerCase()));
            handler(req, res);
          });
          await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
          port = (server.address() as AddressInfo).port;
        });
        afterAll(async () => {
          await new Promise((resolve) => server.close(resolve));
        });

        const raw = (secrets: string[]) =>
          new Promise<number>((resolve, reject) => {
            const body = JSON.stringify(start(A));
            const headers = { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), [HEADER]: secrets };
            // Un arreglo como valor hace que Node escriba una línea de cabecera por elemento, sin unirlas.
            const req = httpRequest({ host: '127.0.0.1', port, path: WEBHOOK, method: 'POST', headers }, (res) => {
              res.resume();
              res.on('end', () => resolve(res.statusCode!));
            });
            req.on('error', reject);
            req.end(body);
          });

        it.each([
          ['correcta primero', (g: string) => [g, 'incorrecta-segunda']],
          ['incorrecta primero', (g: string) => ['incorrecta-primera', g]],
        ])('%s responde 401 sin efectos', async (_n, order) => {
          const before = await countAllRows(pool);
          received = [];
          const status = await raw(order(good()));
          // El servidor vio dos líneas de la cabecera: la repetición sí llegó.
          expect(received.at(-1)!.filter((h) => h === HEADER.toLowerCase())).toHaveLength(2);
          expect(status).toBe(401);
          await expectNoEffects(before);
        });
      });
    });

    it('1.6 el secreto correcto en la consulta, el cuerpo o Authorization no sustituye a la cabecera', async () => {
      const secret = good();
      const before = await countAllRows(pool);
      const url = request(app.getHttpServer());
      await url.post(`${WEBHOOK}?secret_token=${secret}`).send(start(A)).expect(401);
      await url.post(WEBHOOK).send(start(A, { secret_token: secret, [HEADER]: secret })).expect(401);
      await url.post(WEBHOOK).set('Authorization', `Bearer ${secret}`).send(start(A)).expect(401);
      await url.post(WEBHOOK).set('Authorization', secret).send(start(A)).expect(401);
      await expectNoEffects(before);
    });
  });

  describe('transversales', () => {
    it('T.1 los logs de los 401 y de los 200 no contienen el secreto, el token, el chat, el update_id ni el cuerpo', async () => {
      const secret = good();
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      const marker = 'MARCADOR-CUERPO-F007';
      const sentSecret = 'enviado-incorrecto-F007';
      const update = start(A);
      update.message.text = `/start ${marker}`;

      const capture = async (fn: () => Promise<void>) => {
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
      };

      // Control: el logger capturado está vivo y la búsqueda puede fallar.
      const probe = await capture(async () => {
        new Logger('F007').log(`línea de prueba ${marker} ${A} ${update.update_id} ${sentSecret}`);
      });
      for (const needle of [marker, String(A), String(update.update_id), sentSecret]) expect(probe).toContain(needle);

      const logs401 = await capture(async () => {
        await post(update, null).expect(401);
        await post(update, sentSecret).expect(401);
        delete process.env.TELEGRAM_WEBHOOK_SECRET;
        await post(update, sentSecret).expect(401);
        process.env.TELEGRAM_WEBHOOK_SECRET = secret;
      });
      for (const needle of [secret, token, sentSecret, String(A), String(update.update_id), marker]) {
        expect(logs401).not.toContain(needle);
      }

      const logs200 = await capture(async () => {
        await post(start(A)).expect(200);
      });
      expect(logs200).not.toContain(secret);
      expect(logs200).not.toContain(token);
    });

    it.each(['get', 'put', 'delete'] as const)('T.2 %s sobre la ruta, con y sin secreto, no procesa nada', async (method) => {
      const before = await countAllRows(pool);
      for (const secret of [null, good()]) {
        const req = request(app.getHttpServer())[method](WEBHOOK);
        const res = await (secret === null ? req : req.set(HEADER, secret)).send(method === 'get' ? undefined : start(A));
        expect([404, 405]).toContain(res.status);
      }
      await expectNoEffects(before);
    });
  });
});
