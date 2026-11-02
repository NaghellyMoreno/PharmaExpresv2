import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Puertos propios para no chocar con el entorno de desarrollo (3000 y 5173).
const API_PORT = 3100;
const WEB_PORT = 4173;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

// Valores solo para pruebas, sin secretos reales. La web y la API comparten origen por el proxy de Vite,
// igual que en Vercel (ADR 0002); Chromium trata localhost como contexto seguro y acepta cookies Secure.
// F003: las claves del código y de la huella se comparten con las pruebas (que recalculan la huella). Aleatorias por corrida.
process.env.CEDULA_FINGERPRINT_KEY ??= randomBytes(32).toString('base64url');
process.env.OTP_PEPPER ??= randomBytes(32).toString('base64url');

// F009 (R.1): la salida de la API va a un archivo que las pruebas leen para comprobar que no filtra datos.
process.env.PE_API_LOG = join(tmpdir(), 'pharma-express-e2e-api.log');

const apiEnv = {
  PORT: String(API_PORT),
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma',
  APP_ORIGIN: WEB_ORIGIN,
  CONSENT_COOKIE_KEY: randomBytes(32).toString('base64url'),
  CEDULA_FINGERPRINT_KEY: process.env.CEDULA_FINGERPRINT_KEY,
  OTP_PEPPER: process.env.OTP_PEPPER,
  // Modo capture (ADR 0009): los mensajes quedan en app.captured_messages y no sale nada.
  MESSAGING_MODE: 'capture',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: WEB_ORIGIN, ...devices['Desktop Chrome'], locale: 'es-CO', timezoneId: 'America/Bogota' },
  webServer: [
    {
      command: `sh -c 'exec node ../apps/api/dist/main.js >"$PE_API_LOG" 2>&1'`,
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Compilación de producción (sin el doble efecto de StrictMode del modo de desarrollo). La compilación se
      // hace antes, en el script `e2e`: dentro del webServer agotaba el plazo en frío (hallazgo H1 de QA, F001).
      command: `pnpm --filter web exec vite preview --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
