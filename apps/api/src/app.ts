import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

export const API_PREFIX = 'api/v1';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: ['error', 'warn'] });
  app.setGlobalPrefix(API_PREFIX);
  return app;
}
