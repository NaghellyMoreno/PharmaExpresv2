import { pgSchema } from 'drizzle-orm/pg-core';

// Esquemas del ADR 0003. Las tablas llegan con cada funcionalidad.
// app.test_clock y app.clock_now() se crean en la migración inicial (ADR 0021).
export const appSchema = pgSchema('app');
export const simSchema = pgSchema('sim');
