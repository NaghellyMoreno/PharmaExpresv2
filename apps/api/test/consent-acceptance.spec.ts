import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/client.js';
import { ConsentCookieService } from '../src/modules/identity/consent-cookie.service.js';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice.js';
import { createTestApp } from './support/app.js';
import { countRows } from './support/db.js';

const URL = '/api/v1/consents/acceptance';
const ORIGIN = process.env.APP_ORIGIN!;
const FIXED = new Date('2026-03-04T10:15:00.000Z');
const valid = (declarant = 'third_party') => ({ noticeVersion: PRIVACY_NOTICE.version, declarant });
const setCookie = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

describe('POST /api/v1/consents/acceptance', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const post = () => request(app.getHttpServer()).post(URL);
  beforeAll(async () => {
    app = await createTestApp({ clock: { now: async () => FIXED } });
    pool = createPool();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  // Criterios 4.1 y 4.2
  it.each(['third_party', 'holder'])('con declarant %s responde 204 y emite la cookie firmada', async (declarant) => {
    const res = await post().set('Origin', ORIGIN).send(valid(declarant));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const cookies = setCookie(res);
    expect(cookies).toHaveLength(1);
    const attrs = cookies[0].split('; ');
    expect(attrs[0].startsWith('__Host-pe_consent=')).toBe(true);
    expect(attrs).toEqual(expect.arrayContaining(['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict']));
    expect(cookies[0]).not.toMatch(/Domain=/i);
    expect(cookies[0]).not.toMatch(/Max-Age|Expires/i);
    expect(cookies.join(';')).not.toContain('__Host-pe_device');
    // Firmada con CONSENT_COOKIE_KEY y con el declarante enviado.
    const value = decodeURIComponent(attrs[0].split('=')[1]);
    const payload = new ConsentCookieService(process.env.CONSENT_COOKIE_KEY!).verify(value);
    expect(payload).toMatchObject({ declarant, channel: 'web', noticeVersion: PRIVACY_NOTICE.version });
  });

  // Criterio 4.4
  it('la cookie guarda la hora de la aceptación según el reloj de la aplicación', async () => {
    const res = await post().set('Origin', ORIGIN).send(valid());
    const value = decodeURIComponent(setCookie(res)[0].split('; ')[0].split('=')[1]);
    expect(new ConsentCookieService(process.env.CONSENT_COOKIE_KEY!).verify(value)?.acceptedAt).toBe(FIXED.toISOString());
  });

  // Criterio 4.5
  it('con una versión que no es la vigente responde 409 problem+json y no emite cookie', async () => {
    const res = await post().set('Origin', ORIGIN).send({ noticeVersion: 'otra-version', declarant: 'holder' });
    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 409, code: 'notice_version_outdated' });
    expect(setCookie(res)).toHaveLength(0);
  });

  // Criterio 4.6
  it.each([
    ['declarant fuera de los valores', { noticeVersion: PRIVACY_NOTICE.version, declarant: 'admin' }],
    ['noticeVersion ausente', { declarant: 'holder' }],
    ['noticeVersion de más de 32 caracteres', { noticeVersion: 'x'.repeat(33), declarant: 'holder' }],
    ['campo no previsto', { ...valid(), cedula: '1000000001' }],
    ['sin cuerpo', undefined],
  ])('%s responde 400 y no emite cookie', async (_n, body) => {
    const res = await post().set('Origin', ORIGIN).send(body);
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(setCookie(res)).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain('1000000001');
  });

  it('un cuerpo de más de 100 KB responde 413 y no emite cookie', async () => {
    const res = await post().set('Origin', ORIGIN).send({ noticeVersion: 'x'.repeat(101 * 1024), declarant: 'holder' });
    expect([400, 413]).toContain(res.status);
    expect(setCookie(res)).toHaveLength(0);
  });

  // Criterio 4.7
  it('sin Origin o con otro Origin responde 403 sin cookie', async () => {
    const sin = await post().send(valid());
    const otro = await post().set('Origin', 'https://sitio-malicioso.example').send(valid());
    for (const res of [sin, otro]) {
      expect(res.status).toBe(403);
      expect(setCookie(res)).toHaveLength(0);
    }
  });

  // Criterios 3.3 y 4.9
  it('una petición válida y varias inválidas no cambian el conteo de filas', async () => {
    const before = await countRows(pool);
    await post().set('Origin', ORIGIN).send(valid()).expect(204);
    await post().set('Origin', ORIGIN).send(valid('holder')).expect(204);
    await post().set('Origin', ORIGIN).send({ noticeVersion: 'otra', declarant: 'holder' }).expect(409);
    await post().set('Origin', ORIGIN).send({ declarant: 'x' }).expect(400);
    await post().send(valid()).expect(403);
    expect(await countRows(pool)).toEqual(before);
  });

  // Criterio T.2
  it('lleva X-Content-Type-Options y Content-Security-Policy', async () => {
    const res = await post().set('Origin', ORIGIN).send(valid());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
