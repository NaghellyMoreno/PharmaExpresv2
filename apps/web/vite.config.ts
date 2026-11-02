/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  // En local, /api llega a la API de NestJS (ADR 0002, decisión 9).
  server: { proxy: { '/api': apiTarget } },
  preview: { proxy: { '/api': apiTarget } },
  test: { environment: 'jsdom', setupFiles: ['./src/setupTests.ts'] },
});
