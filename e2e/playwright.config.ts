import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Puertos propios para no chocar con el entorno de desarrollo (3000 y 5173).
const API_PORT = 3100;
const WEB_PORT = 4173;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

// Valores solo para pruebas, sin secretos reales. La web y la API comparten origen por el proxy de Vite,
// igual que en Vercel (ADR 0002); Chromium trata localhost como contexto seguro y acepta cookies Secure.
const apiEnv = {
  PORT: String(API_PORT),
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma',
  APP_ORIGIN: WEB_ORIGIN,
  CONSENT_COOKIE_KEY: randomBytes(32).toString('base64url'),
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
      command: 'node ../apps/api/dist/main.js',
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
