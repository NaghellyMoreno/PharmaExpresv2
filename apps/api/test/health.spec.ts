import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde 200 con { status: "ok" }, como dice el contrato', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
