import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc conserva los metadatos de decoradores que necesita NestJS (ADR 0017).
export default defineConfig({
  test: { globals: false, environment: 'node', include: ['test/**/*.spec.ts'], fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
