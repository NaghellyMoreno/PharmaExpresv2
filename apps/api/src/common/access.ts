import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const ACCESS_KEY = 'pe:access';

export interface PublicOptions {
  /** Exige que `Origin` sea APP_ORIGIN en operaciones que cambian datos (ADR 0016, decisión 6). */
  checkOrigin?: boolean;
}

export interface AccessMark {
  kind: 'public';
  checkOrigin: boolean;
}

/** Ruta pública: solo las de la lista aprobada del ADR 0016. */
export const Public = (options: PublicOptions = {}) =>
  SetMetadata(ACCESS_KEY, { kind: 'public', checkOrigin: options.checkOrigin ?? false } satisfies AccessMark);

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
    if (mark.checkOrigin && MUTATING.has(req.method)) {
      const allowed = process.env.APP_ORIGIN;
      if (!allowed || req.headers.origin !== allowed) {
        throw new ForbiddenException({ code: 'origin_not_allowed', title: 'Origen no permitido' });
      }
    }
    return true;
  }
}
