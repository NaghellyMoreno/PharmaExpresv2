import { randomBytes } from 'node:crypto';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc conserva los metadatos de decoradores que necesita NestJS (ADR 0017).
// Valores solo para pruebas, sin secretos reales: la clave de la cookie es aleatoria en cada corrida.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // Los archivos corren en serie: app.test_clock y las tablas de F003 son estado global de la base (criterio T.7).
    fileParallelism: false,
    globalSetup: ['./test/support/global-setup.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma',
      APP_ORIGIN: 'http://localhost:4173',
      CONSENT_COOKIE_KEY: randomBytes(32).toString('base64url'),
      // F003: claves aleatorias por corrida, solo para pruebas.
      CEDULA_FINGERPRINT_KEY: randomBytes(32).toString('base64url'),
      OTP_PEPPER: randomBytes(32).toString('base64url'),
      // Bot de pruebas: nunca se llama a Telegram (modo capture) y los secretos son aleatorios por corrida.
      MESSAGING_MODE: 'capture',
      TELEGRAM_BOT_TOKEN: `123456:${randomBytes(24).toString('base64url')}`,
      TELEGRAM_WEBHOOK_SECRET: randomBytes(24).toString('base64url'),
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
