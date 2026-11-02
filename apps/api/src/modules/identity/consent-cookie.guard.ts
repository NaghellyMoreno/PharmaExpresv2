import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/access';
import { CONSENT_COOKIE_NAME, ConsentCookieService, type ConsentPayload } from './consent-cookie.service';
import { readCookie } from './cookies';

type RequestWithConsent = Request & { consent?: ConsentPayload };

/** Exige la cookie firmada de consentimiento: sin ella o con firma alterada, 401 (invariante 3). */
@Injectable()
export class ConsentCookieGuard implements CanActivate {
  constructor(private readonly cookies: ConsentCookieService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithConsent>();
    const value = readCookie(req, CONSENT_COOKIE_NAME);
    const payload = value ? this.cookies.verify(value) : null;
    // La fecha de aceptación es lo que luego se guarda en la base: debe ser una fecha válida.
    if (!payload || Number.isNaN(Date.parse(payload.acceptedAt))) {
      throw new UnauthorizedException({ code: 'unauthorized', title: 'Debe aceptar el aviso de privacidad' });
    }
    req.consent = payload;
    return true;
  }
}

/** Ruta pública que cambia datos: exige `Origin` válido y la cookie de consentimiento. */
export const PublicWithConsent = () =>
  applyDecorators(Public({ checkOrigin: true, requireConsent: true }), UseGuards(ConsentCookieGuard));

/** La carga útil verificada de la cookie de consentimiento (nunca el cuerpo de la petición). */
export const Consent = createParamDecorator((_data: unknown, ctx: ExecutionContext): ConsentPayload => {
  return ctx.switchToHttp().getRequest<RequestWithConsent>().consent!;
});
