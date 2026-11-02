import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request',
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
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : {};
    const extra = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const code = typeof extra.code === 'string' ? extra.code : (DEFAULT_CODES[status] ?? 'internal_error');
    const title = typeof extra.title === 'string' ? extra.title : 'No se pudo completar la solicitud';
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://pharma-express.example/errors/${code}`,
        title,
        status,
        code,
        ...(Array.isArray(extra.fieldErrors) ? { fieldErrors: extra.fieldErrors } : {}),
      });
  }
}
