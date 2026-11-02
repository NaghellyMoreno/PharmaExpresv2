import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgSchema, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

/** Afiliados de la EPS simulada (sección 3.8, ADR 0013). La aplicación solo los lee; los carga `db:seed`. */
export const affiliates = simSchema.table(
  'affiliates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    cedula: text('cedula').notNull().unique(),
    fullName: text('full_name').notNull(),
    eps: text('eps').notNull(),
    affiliationStatus: text('affiliation_status').notNull(),
    mobilePhone: text('mobile_phone').notNull(),
    email: text('email'),
  },
  (t) => [
    check('affiliates_eps_valid', sql`${t.eps} IN ('salud_total', 'sanitas')`),
    check('affiliates_status_valid', sql`${t.affiliationStatus} IN ('active', 'inactive')`),
  ],
);

/** Retos del código de un solo uso (ADR 0006). Nunca guarda la cédula ni el código: solo sus huellas. */
export const otpChallenges = appSchema.table(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    cedulaFingerprint: text('cedula_fingerprint').notNull(),
    purpose: text('purpose').notNull(),
    codeHash: text('code_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attemptsUsed: integer('attempts_used').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
  },
  (t) => [
    check('otp_challenges_purpose_valid', sql`${t.purpose} IN ('verify', 'revoke')`),
    check('otp_challenges_attempts_max', sql`${t.attemptsUsed} >= 0 AND ${t.attemptsUsed} <= 3`),
    // Un solo reto vigente por huella, de cualquier propósito (R-19, ADR 0006).
    uniqueIndex('otp_challenges_one_live_per_fingerprint')
      .on(t.cedulaFingerprint)
      .where(sql`${t.consumedAt} IS NULL AND ${t.supersededAt} IS NULL`),
    index('otp_challenges_fingerprint_created_idx').on(t.cedulaFingerprint, t.createdAt),
  ],
);

/** Prueba de la aceptación. Solo inserción; sin clave foránea a datos del paciente (sobrevive a la revocación). */
export const consentRecords = appSchema.table(
  'consent_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    kind: text('kind').notNull(),
    cedulaFingerprint: text('cedula_fingerprint').notNull(),
    declarant: text('declarant').notNull(),
    channel: text('channel').notNull(),
    noticeVersion: text('notice_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
  },
  (t) => [
    check('consent_records_kind_valid', sql`${t.kind} IN ('data_processing', 'health_data', 'revocation')`),
    check('consent_records_declarant_valid', sql`${t.declarant} IN ('holder', 'third_party')`),
    check('consent_records_channel_valid', sql`${t.channel} IN ('web', 'telegram')`),
    // R-29: la aceptación nunca es posterior a su registro.
    check('consent_records_accepted_before_recorded', sql`${t.acceptedAt} <= ${t.recordedAt}`),
    index('consent_records_fingerprint_idx').on(t.cedulaFingerprint),
  ],
);

/** Referencia al paciente, no cuenta. Se crea al primer código correcto (invariante 3). */
export const patientRefs = appSchema.table('patient_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  cedulaFingerprint: text('cedula_fingerprint').notNull().unique(),
  simAffiliateId: uuid('sim_affiliate_id').notNull().unique(),
});

/** Navegador vinculado. Solo guarda el hash del token de la cookie (ADR 0007). */
export const browserDevices = appSchema.table('browser_devices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text('token_hash').notNull().unique(),
  csrfHash: text('csrf_hash').notNull(),
  pushSubscription: jsonb('push_subscription'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
});

/** Vinculación de un canal (navegador o chat) con un paciente por 3 meses (ADR 0007). */
export const channelBindings = appSchema.table(
  'channel_bindings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    patientRefId: uuid('patient_ref_id')
      .notNull()
      .references(() => patientRefs.id, { onDelete: 'cascade' }),
    browserDeviceId: uuid('browser_device_id').references(() => browserDevices.id, { onDelete: 'cascade' }),
    telegramChatId: uuid('telegram_chat_id').references(() => telegramChats.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('channel_bindings_one_channel', sql`num_nonnulls(${t.browserDeviceId}, ${t.telegramChatId}) = 1`),
    check('channel_bindings_three_months', sql`${t.expiresAt} = ${t.createdAt} + interval '3 months'`),
    uniqueIndex('channel_bindings_one_live_per_browser')
      .on(t.browserDeviceId, t.patientRefId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.browserDeviceId} IS NOT NULL`),
    uniqueIndex('channel_bindings_one_live_per_chat')
      .on(t.telegramChatId, t.patientRefId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.telegramChatId} IS NOT NULL`),
  ],
);

/**
 * Mensajes del modo `capture` (ADR 0009). Tabla de prueba: la migración solo la crea si la base no es de
 * producción (`pharma.environment`). Nunca se lee en producción.
 */
export const capturedMessages = appSchema.table(
  'captured_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    channel: text('channel').notNull(),
    destination: text('destination').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`app.clock_now()`),
  },
  (t) => [check('captured_messages_channel_valid', sql`${t.channel} IN ('sms', 'email')`)],
);
