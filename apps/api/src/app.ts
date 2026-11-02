import { BadRequestException, LoggerService, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/problem.filter';

export const API_PREFIX = 'api/v1';

export interface CreateAppOptions {
  logger?: LoggerService;
}

/** Configuración común de la aplicación (la usan main.ts y las pruebas). */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.setGlobalPrefix(API_PREFIX);
  // Sin ETag: el cuerpo de las respuestas del código no debe dejar rastro que distinga cédulas (criterio 9.1 de F003).
  app.disable('etag');
  app.useBodyParser('json', { limit: '100kb' });
  // CSP default-src 'none' y frame-ancestors 'none' para respuestas JSON (ADR 0016, decisión 5).
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Solo nombres de campo: nunca los valores recibidos (invariante 8).
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          code: 'validation_failed',
          title: 'La solicitud no es válida',
          fieldErrors: errors.map((e) => ({ field: e.property, message: 'Valor no válido' })),
        }),
    }),
  );
  return app;
}

export async function createApp(options: CreateAppOptions = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: options.logger ?? ['error', 'warn'],
  });
  return configureApp(app);
}
