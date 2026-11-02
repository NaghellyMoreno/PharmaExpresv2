import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DeviceSessionRoute } from '../../common/access.js';
import { DEVICE_COOKIE_NAME, readCookie } from './cookies.js';
import { IdentityService } from './identity.service.js';

type RequestWithDevice = Request & { deviceId?: string };

// Los tokens se generan con 32 bytes en base64url (43 caracteres); cualquier otra forma ni se consulta.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * Autentica al navegador por la cookie `__Host-pe_device` (`deviceSession`). La cookie solo identifica al navegador:
 * qué paciente puede ver lo decide la vinculación vigente en la base, no la cookie (ADR 0007, decisión 1).
 * Sin cookie, mal formada o desconocida: el mismo 401 genérico, sin crear nada.
 */
@Injectable()
export class DeviceSessionGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithDevice>();
    const token = readCookie(req, DEVICE_COOKIE_NAME);
    const device = token && TOKEN_FORMAT.test(token) ? await this.identity.findDevice(token) : null;
    if (!device) throw new UnauthorizedException({ code: 'unauthorized', title: 'No hay una sesión vigente' });
    req.deviceId = device.id;
    return true;
  }
}

/** Ruta del navegador vinculado: marca de acceso `deviceSession` más el guard que la autentica. */
export const DeviceSession = () => applyDecorators(DeviceSessionRoute(), UseGuards(DeviceSessionGuard));

/** Identificador del navegador que autenticó el guard. */
export const DeviceId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<RequestWithDevice>().deviceId!;
});
