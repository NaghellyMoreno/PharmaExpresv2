import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice';
import { createTestApp } from './support/app';

// F008, criterios 2.1 y 2.2: HSTS, CSP y nosniff en la API, también en respuestas de error y de POST.
const MIN_HSTS_SECONDS = 15552000; // 180 días (Inferido en el contrato)
const ORIGIN = process.env.APP_ORIGIN!;

function expectSecurityHeaders(res: request.Response) {
  const hsts = String(res.headers['strict-transport-security']);
  const maxAge = /max-age=(\d+)/.exec(hsts);
  expect(maxAge, 'Strict-Transport-Security con max-age').not.toBeNull();
  expect(Number(maxAge![1])).toBeGreaterThanOrEqual(MIN_HSTS_SECONDS);
  const csp = String(res.headers['content-security-policy']);
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers['x-content-type-options']).toBe('nosniff');
}

describe('F008: cabeceras de seguridad de la API', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  const http = () => request(app.getHttpServer());

  it('2.1: GET /api/v1/health (200) trae HSTS, CSP y nosniff', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  it('2.2 (a): 404 en GET /api/v1/no-existe', async () => {
    const res = await http().get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  it('2.2 (b): 401 en POST /api/v1/telegram/webhook sin el secreto', async () => {
    const res = await http().post('/api/v1/telegram/webhook').send({});
    expect(res.status).toBe(401);
    expectSecurityHeaders(res);
  });

  it('2.2 (c): 400 en POST /api/v1/consents/acceptance con un campo desconocido', async () => {
    const res = await http()
      .post('/api/v1/consents/acceptance')
      .set('Origin', ORIGIN)
      .send({ noticeVersion: PRIVACY_NOTICE.version, declarant: 'holder', extra: 'x' });
    expect(res.status).toBe(400);
    expectSecurityHeaders(res);
  });

  it('2.2 (d): 204 en POST /api/v1/consents/acceptance con un cuerpo válido', async () => {
    const res = await http()
      .post('/api/v1/consents/acceptance')
      .set('Origin', ORIGIN)
      .send({ noticeVersion: PRIVACY_NOTICE.version, declarant: 'holder' });
    expect(res.status).toBe(204);
    expectSecurityHeaders(res);
  });
});
