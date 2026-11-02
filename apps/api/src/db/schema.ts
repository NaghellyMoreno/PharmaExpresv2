import { sql } from 'drizzle-orm';
import { bigint, jsonb, pgSchema, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

// Esquemas del ADR 0003. Las tablas llegan con cada funcionalidad.
// app.test_clock y app.clock_now() se crean en la migración inicial (ADR 0021).
export const appSchema = pgSchema('app');
export const simSchema = pgSchema('sim');

/**
 * Chats de Telegram que aceptaron el aviso (docs/03-arquitectura.md). Solo se crea al aceptar:
 * antes de eso no se guarda nada (invariante 3). Sin nombre de usuario ni nombre visible (invariante 4).
 */
export const telegramChats = pgTable('telegram_chats', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  chatId: bigint('chat_id', { mode: 'number' }).notNull().unique(),
  conversation: jsonb('conversation').notNull(),
  lastUpdateId: bigint('last_update_id', { mode: 'number' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
});
