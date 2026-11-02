import 'reflect-metadata';
import { createApp } from './app.js';

// Vercel detecta esta entrada y la ejecuta como una sola función (ADR 0002).
async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
