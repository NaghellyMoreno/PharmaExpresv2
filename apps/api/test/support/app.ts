import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app';
import { CLOCK, type Clock } from '../../src/common/clock';

/** Crea la aplicación de pruebas; `clock` fija la hora de aceptación (ADR 0021). */
export async function createTestApp(
  options: { clock?: Clock; logger?: LoggerService; overrides?: Array<[token: unknown, value: unknown]> } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const [token, value] of options.overrides ?? []) builder = builder.overrideProvider(token as never).useValue(value);
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  if (options.logger) app.useLogger(options.logger);
  configureApp(app);
  await app.init();
  return app;
}
