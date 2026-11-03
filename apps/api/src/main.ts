import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './create-app.js';

// Vercel detecta esta entrada y la ejecuta como una sola función (ADR 0002). Debe importar NestJS directamente:
// el detector de Vercel busca `@nestjs/*` en el propio archivo. La configuración común vive en create-app.ts.
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn'],
  });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
