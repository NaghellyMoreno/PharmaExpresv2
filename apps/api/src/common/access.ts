import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const ACCESS_KEY = 'pe:access';

export interface PublicOptions {
  /** Exige que `Origin` sea APP_ORIGIN en operaciones que cambian datos (ADR 0016, decisión 6). */
  checkOrigin?: boolean;
  /** Ruta que además exige la cookie firmada de consentimiento (la aplica `ConsentCookieGuard`). */
  requireConsent?: boolean;
}

export interface AccessMark {
  kind: 'public' | 'telegram_webhook';
  checkOrigin: boolean;
  requireConsent?: boolean;
}

/** Ruta pública: solo las de la lista aprobada del ADR 0016. */
export const Public = (options: PublicOptions = {}) =>
  SetMetadata(ACCESS_KEY, {
    kind: 'public',
    checkOrigin: options.checkOrigin ?? false,
    requireConsent: options.requireConsent ?? false,
  } satisfies AccessMark);

/**
 * Webhook de Telegram: no lleva sesión ni `Origin`; lo protege el secreto de la cabecera
 * `X-Telegram-Bot-Api-Secret-Token` (ADR 0008, decisión 2, y ADR 0016).
 */
export const TelegramWebhook = () =>
  SetMetadata(ACCESS_KEY, { kind: 'telegram_webhook', checkOrigin: false } satisfies AccessMark);

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Compara en tiempo constante; sin secreto configurado nunca coincide (el webhook no queda abierto). */
export function webhookSecretMatches(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.headers['x-telegram-bot-api-secret-token'];
  if (!expected || typeof given !== 'string' || given === '') return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Guard global: toda ruta debe declarar una marca; sin marca, 403 (denegar por defecto). */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const mark = this.reflector.getAllAndOverride<AccessMark | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!mark) throw new ForbiddenException({ code: 'forbidden', title: 'Acceso denegado' });

    const req = context.switchToHttp().getRequest<Request>();
    if (mark.kind === 'telegram_webhook') {
      if (!webhookSecretMatches(req)) throw new UnauthorizedException({ code: 'unauthorized', title: 'No autorizado' });
      return true;
    }
    if (mark.checkOrigin && MUTATING.has(req.method)) {
      const allowed = process.env.APP_ORIGIN;
      if (!allowed || req.headers.origin !== allowed) {
        throw new ForbiddenException({ code: 'origin_not_allowed', title: 'Origen no permitido' });
      }
    }
    return true;
  }
}
