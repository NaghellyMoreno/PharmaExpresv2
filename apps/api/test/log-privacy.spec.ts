import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTICE } from '../src/modules/identity/privacy-notice.js';
import { createTestApp } from './support/app.js';

// Criterio 3.4 (invariante 8): ni cédulas ni el valor de la cookie en los registros.
const CEDULA = /\b\d{6,10}\b/;
const lines: string[] = [];
const sink: LoggerService = {
  log: (m) => lines.push(String(m)),
  error: (m, ...r) => lines.push([m, ...r].map(String).join(' ')),
  warn: (m) => lines.push(String(m)),
  debug: (m) => lines.push(String(m)),
  verbose: (m) => lines.push(String(m)),
};

describe('registros de la API', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp({ logger: sink });
  });
  afterAll(async () => {
    await app.close();
  });

  it('el detector marca una línea con cédula (control positivo)', () => {
    expect(CEDULA.test('usuario 1000000001 consulta')).toBe(true);
  });

  it('el recorrido de F001 no deja cédulas ni el valor de la cookie en los registros', async () => {
    const out: string[] = [];
    const spies = [process.stdout, process.stderr].map((s) =>
      vi.spyOn(s, 'write').mockImplementation(((chunk: unknown) => {
        out.push(String(chunk));
        return true;
      }) as never),
    );
    let cookieValue = '';
    try {
      const origin = process.env.APP_ORIGIN!;
      await request(app.getHttpServer()).get('/api/v1/privacy-notice');
      const ok = await request(app.getHttpServer())
        .post('/api/v1/consents/acceptance')
        .set('Origin', origin)
        .send({ noticeVersion: PRIVACY_NOTICE.version, declarant: 'holder' });
      cookieValue = decodeURIComponent((ok.headers['set-cookie'] as unknown as string[])[0].split('; ')[0].split('=')[1]);
      // Peticiones inválidas que traen una cédula ficticia en el cuerpo.
      await request(app.getHttpServer())
        .post('/api/v1/consents/acceptance')
        .set('Origin', origin)
        .send({ noticeVersion: PRIVACY_NOTICE.version, declarant: 'holder', cedula: '1000000001' });
      await request(app.getHttpServer()).post('/api/v1/consents/acceptance').send({ cedula: '1000000001' });
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    expect(cookieValue.length).toBeGreaterThan(20);
    const all = [...lines, ...out].join('\n');
    expect(all).not.toMatch(CEDULA);
    expect(all).not.toContain(cookieValue);
  });
});
