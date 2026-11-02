import { Controller, Get, Post, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_KEY, AccessGuard, DeviceSessionRoute, Public, TelegramWebhook, type AccessMark } from '../src/common/access.js';
import { API_PREFIX } from '../src/app.js';
import { createTestApp } from './support/app.js';

// Lista aprobada de rutas públicas (ADR 0016, decisión 1).
const APPROVED_PUBLIC = [
  'GET /health',
  'GET /privacy-notice',
  'GET /health-data-notice',
  'POST /consents/acceptance',
  'POST /identity/otp-requests',
  'POST /identity/verifications',
  'POST /revocations/otp-requests',
  'POST /revocations',
  'POST /staff/sessions',
  'POST /staff/password-resets',
  'POST /staff/password-changes',
];

// Rutas públicas que además exigen la cookie firmada de consentimiento (invariante 3, F003 criterio T.2).
const APPROVED_CONSENT_REQUIRED = ['POST /identity/otp-requests', 'POST /identity/verifications'];

// Webhook de Telegram: protegido por secreto, sin sesión ni Origin (ADR 0008 y 0016).
const APPROVED_TELEGRAM_WEBHOOK = ['POST /telegram/webhook'];

// Rutas del navegador vinculado (`deviceSession`, F009): las autentica DeviceSessionGuard con la cookie de dispositivo.
const APPROVED_DEVICE_SESSION = ['GET /me'];

interface RouteInfo {
  route: string;
  mark?: AccessMark;
}

function listRoutes(controllers: Function[]): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const ctrl of controllers) {
    const prefix = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '').replace(/^\/|\/$/g, '');
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = ctrl.prototype[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(/^\/|\/$/g, '');
      const mark = (Reflect.getMetadata(ACCESS_KEY, handler) ?? Reflect.getMetadata(ACCESS_KEY, ctrl)) as AccessMark | undefined;
      routes.push({ route: `${RequestMethod[method]} /${[prefix, path].filter(Boolean).join('/')}`, mark });
    }
  }
  return routes;
}

function problems(routes: RouteInfo[]): string[] {
  const out: string[] = [];
  for (const { route, mark } of routes) {
    if (!mark) out.push(`${route}: sin marca de acceso`);
    else if (mark.kind === 'device_session') {
      if (!APPROVED_DEVICE_SESSION.includes(route)) out.push(`${route}: de navegador (deviceSession) fuera de la lista aprobada`);
      if (!mark.checkOrigin) out.push(`${route}: de navegador sin control de Origin`);
    } else if (mark.kind === 'telegram_webhook') {
      if (!APPROVED_TELEGRAM_WEBHOOK.includes(route)) out.push(`${route}: webhook de Telegram fuera de la lista aprobada`);
    } else if (mark.kind === 'public') {
      if (!APPROVED_PUBLIC.includes(route)) out.push(`${route}: pública fuera de la lista aprobada`);
      if (route.startsWith('POST') && !mark.checkOrigin) out.push(`${route}: pública que cambia datos sin control de Origin`);
      if (APPROVED_CONSENT_REQUIRED.includes(route) && !mark.requireConsent) out.push(`${route}: debe exigir la cookie de consentimiento`);
    }
  }
  return out;
}

// Criterio 4.10
describe('marcas de acceso de las rutas (ADR 0016)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('toda ruta real tiene marca y las públicas están en la lista aprobada', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap((m) =>
      [...m.controllers.values()].map((w) => w.metatype as Function),
    );
    const routes = listRoutes(controllers);
    expect(routes.map((r) => r.route)).toEqual(expect.arrayContaining(['GET /privacy-notice', 'POST /consents/acceptance', 'POST /telegram/webhook', ...APPROVED_DEVICE_SESSION, ...APPROVED_CONSENT_REQUIRED]));
    expect(problems(routes)).toEqual([]);
  });

  it('la enumeración falla ante una ruta sin marca o pública fuera de la lista (control positivo)', () => {
    @Controller('sin-marca')
    class SinMarca {
      @Get() uno() {}
      @Public() @Get('extra') dos() {}
      @Public() @Post('cambia') tres() {}
      @TelegramWebhook() @Post('otro-webhook') cuatro() {}
    }
    expect(problems(listRoutes([SinMarca]))).toHaveLength(5);
  });

  // F009, criterio 2.11: una ruta de navegador fuera de la lista aprobada hace fallar la enumeración.
  it('falla ante una ruta deviceSession fuera de la lista aprobada (control positivo)', () => {
    @Controller('me')
    class DeNavegador {
      @DeviceSessionRoute() @Get() uno() {}
      @DeviceSessionRoute() @Get('otra') dos() {}
    }
    expect(problems(listRoutes([DeNavegador]))).toEqual(['GET /me/otra: de navegador (deviceSession) fuera de la lista aprobada']);
  });

  // Criterio T.2 de F003: una ruta de identidad sin la marca de consentimiento hace fallar la enumeración.
  it('falla si POST /identity/otp-requests no exige la cookie de consentimiento (control positivo)', () => {
    @Controller('identity')
    class SinConsentimiento {
      @Public({ checkOrigin: true }) @Post('otp-requests') uno() {}
      @Public({ checkOrigin: true, requireConsent: true }) @Post('verifications') dos() {}
    }
    expect(problems(listRoutes([SinConsentimiento]))).toEqual(['POST /identity/otp-requests: debe exigir la cookie de consentimiento']);
  });

  // Criterio T.2: el webhook no exige Origin y POST /consents/acceptance sigue exigiéndolo.
  it('el webhook no exige Origin y el POST de consentimiento sí', async () => {
    const hook = await request(app.getHttpServer())
      .post('/api/v1/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!)
      .send({ update_id: 1 });
    expect(hook.status).toBe(200);
    const consent = await request(app.getHttpServer())
      .post('/api/v1/consents/acceptance')
      .send({ noticeVersion: 'x', declarant: 'holder' });
    expect(consent.status).toBe(403);
  });

  it('una ruta sin marca responde 403 (denegar por defecto)', async () => {
    @Controller('sin-marca')
    class SinMarca {
      @Get() uno() {
        return 'dato';
      }
    }
    const mod = await Test.createTestingModule({
      controllers: [SinMarca],
      providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
    }).compile();
    const a = mod.createNestApplication();
    a.setGlobalPrefix(API_PREFIX);
    await a.init();
    const res = await request(a.getHttpServer()).get('/api/v1/sin-marca');
    await a.close();
    expect(res.status).toBe(403);
    expect(res.text).not.toContain('dato');
  });
});
