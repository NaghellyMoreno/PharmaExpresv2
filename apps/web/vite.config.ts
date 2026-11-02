/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // En local, /api llega a la API de NestJS (ADR 0002, decisión 9).
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/setupTests.ts'] },
});
