import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { webhookSecretMatches } from './access';

export const TELEGRAM_WEBHOOK_PATH = '/api/v1/telegram/webhook';

const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
};

/** Errores en formato Problem Details (RFC 9457), sin datos de la petición. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    // El analizador de cuerpo falla antes que el guard. Con secreto correcto el webhook responde 200 aunque
    // el cuerpo no se pueda leer, para que Telegram no reintente (ADR 0008, decisión 4); sin él, 401.
    if (req.path === TELEGRAM_WEBHOOK_PATH && isBodyReadError(exception)) {
      exception = webhookSecretMatches(req) ? undefined : new UnauthorizedException({ code: 'unauthorized', title: 'No autorizado' });
      if (exception === undefined) {
        res.status(200).end();
        return;
      }
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : {};
    const extra = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const code = typeof extra.code === 'string' ? extra.code : (DEFAULT_CODES[status] ?? 'internal_error');
    const title = typeof extra.title === 'string' ? extra.title : 'No se pudo completar la solicitud';
    const retryAfterSeconds = typeof extra.retryAfterSeconds === 'number' ? extra.retryAfterSeconds : undefined;
    if (retryAfterSeconds !== undefined) res.setHeader('Retry-After', String(retryAfterSeconds));
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://pharma-express.example/errors/${code}`,
        title,
        status,
        code,
        ...(Array.isArray(extra.fieldErrors) ? { fieldErrors: extra.fieldErrors } : {}),
        ...(typeof extra.attemptsRemaining === 'number' ? { attemptsRemaining: extra.attemptsRemaining } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        ...(Array.isArray(extra.nextSteps) ? { nextSteps: extra.nextSteps } : {}),
      });
  }
}

/** Nest convierte el error del analizador de cuerpo en BadRequestException; en el webhook no hay otra fuente de 400. */
function isBodyReadError(exception: unknown): boolean {
  return exception instanceof BadRequestException;
}
