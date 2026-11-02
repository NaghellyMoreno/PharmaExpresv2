import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/client';
import { countRows } from './support/db';
import { createTestApp } from './support/app';
import { validateAgainstSchema } from './support/contract';

describe('GET /api/v1/privacy-notice', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  beforeAll(async () => {
    app = await createTestApp();
    pool = createPool();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  // Criterio 1.1
  it('responde 200 con el aviso vigente y cumple el esquema PrivacyNotice', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/privacy-notice');
    expect(res.status).toBe(200);
    expect(res.body.declaration).toBe('Soy el titular o actúo con su autorización');
    expect(res.body.revocationOption.label).toBe('Revocar mi autorización');
    expect(res.body.revocationOption.cedulaUseNotice).not.toBe('');
    expect(res.body.version.length).toBeGreaterThan(0);
    expect(res.body.version.length).toBeLessThanOrEqual(32);
    expect(validateAgainstSchema('PrivacyNotice', res.body)).toEqual([]);
  });

  it('el validador de esquema detecta una versión de más de 32 caracteres (control positivo)', () => {
    const notice = {
      version: 'x'.repeat(33),
      title: 't',
      body: 'b',
      declaration: 'd',
      revocationOption: { label: 'Revocar mi autorización', cedulaUseNotice: 'n' },
    };
    expect(validateAgainstSchema('PrivacyNotice', notice)).not.toEqual([]);
  });

  // Criterio 3.2
  it('tres llamadas no cambian el conteo de filas de ninguna tabla', async () => {
    const before = await countRows(pool);
    for (let i = 0; i < 3; i++) await request(app.getHttpServer()).get('/api/v1/privacy-notice').expect(200);
    expect(await countRows(pool)).toEqual(before);
  });

  // Criterio T.2
  it('lleva X-Content-Type-Options y Content-Security-Policy', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/privacy-notice');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('contador de filas', () => {
  it('detecta una fila nueva en una tabla de public (control positivo)', async () => {
    const pool = createPool();
    try {
      await pool.query('CREATE TABLE public.zz_control_conteo (id int)');
      const before = await countRows(pool);
      await pool.query('INSERT INTO public.zz_control_conteo VALUES (1)');
      const after = await countRows(pool);
      expect(before.zz_control_conteo).toBe(0);
      expect(after.zz_control_conteo).toBe(1);
    } finally {
      await pool.query('DROP TABLE IF EXISTS public.zz_control_conteo');
      await pool.end();
    }
  });
});
