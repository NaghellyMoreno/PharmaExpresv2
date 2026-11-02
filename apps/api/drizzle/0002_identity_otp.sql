-- F003: afiliados simulados, retos del código, consentimiento, referencias de paciente y vinculaciones (invariantes 2, 3 y 8).
CREATE TABLE "sim"."affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cedula" text NOT NULL,
	"full_name" text NOT NULL,
	"eps" text NOT NULL,
	"affiliation_status" text NOT NULL,
	"mobile_phone" text NOT NULL,
	"email" text,
	CONSTRAINT "affiliates_cedula_unique" UNIQUE("cedula"),
	CONSTRAINT "affiliates_eps_valid" CHECK ("sim"."affiliates"."eps" IN ('salud_total', 'sanitas')),
	CONSTRAINT "affiliates_status_valid" CHECK ("sim"."affiliates"."affiliation_status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "app"."browser_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"push_subscription" jsonb,
	"created_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	CONSTRAINT "browser_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- Tabla de prueba del modo capture (ADR 0009): solo existe fuera de producción.
DO $$
BEGIN
	IF current_setting('pharma.environment', true) IS DISTINCT FROM 'production' THEN
		CREATE TABLE "app"."captured_messages" (
			"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			"channel" text NOT NULL,
			"destination" text NOT NULL,
			"subject" text,
			"body" text NOT NULL,
			"created_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
			CONSTRAINT "captured_messages_channel_valid" CHECK ("channel" IN ('sms', 'email'))
		);
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "app"."channel_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_ref_id" uuid NOT NULL,
	"browser_device_id" uuid,
	"telegram_chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "channel_bindings_one_channel" CHECK (num_nonnulls("app"."channel_bindings"."browser_device_id", "app"."channel_bindings"."telegram_chat_id") = 1),
	CONSTRAINT "channel_bindings_three_months" CHECK ("app"."channel_bindings"."expires_at" = "app"."channel_bindings"."created_at" + interval '3 months')
);
--> statement-breakpoint
CREATE TABLE "app"."consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"cedula_fingerprint" text NOT NULL,
	"declarant" text NOT NULL,
	"channel" text NOT NULL,
	"notice_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	CONSTRAINT "consent_records_kind_valid" CHECK ("app"."consent_records"."kind" IN ('data_processing', 'health_data', 'revocation')),
	CONSTRAINT "consent_records_declarant_valid" CHECK ("app"."consent_records"."declarant" IN ('holder', 'third_party')),
	CONSTRAINT "consent_records_channel_valid" CHECK ("app"."consent_records"."channel" IN ('web', 'telegram')),
	CONSTRAINT "consent_records_accepted_before_recorded" CHECK ("app"."consent_records"."accepted_at" <= "app"."consent_records"."recorded_at")
);
--> statement-breakpoint
CREATE TABLE "app"."otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cedula_fingerprint" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts_used" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	CONSTRAINT "otp_challenges_purpose_valid" CHECK ("app"."otp_challenges"."purpose" IN ('verify', 'revoke')),
	CONSTRAINT "otp_challenges_attempts_max" CHECK ("app"."otp_challenges"."attempts_used" >= 0 AND "app"."otp_challenges"."attempts_used" <= 3)
);
--> statement-breakpoint
CREATE TABLE "app"."patient_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cedula_fingerprint" text NOT NULL,
	"sim_affiliate_id" uuid NOT NULL,
	CONSTRAINT "patient_refs_cedula_fingerprint_unique" UNIQUE("cedula_fingerprint"),
	CONSTRAINT "patient_refs_sim_affiliate_id_unique" UNIQUE("sim_affiliate_id")
);
--> statement-breakpoint
ALTER TABLE "app"."channel_bindings" ADD CONSTRAINT "channel_bindings_patient_ref_id_patient_refs_id_fk" FOREIGN KEY ("patient_ref_id") REFERENCES "app"."patient_refs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."channel_bindings" ADD CONSTRAINT "channel_bindings_browser_device_id_browser_devices_id_fk" FOREIGN KEY ("browser_device_id") REFERENCES "app"."browser_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."channel_bindings" ADD CONSTRAINT "channel_bindings_telegram_chat_id_telegram_chats_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_bindings_one_live_per_browser" ON "app"."channel_bindings" USING btree ("browser_device_id","patient_ref_id") WHERE "app"."channel_bindings"."revoked_at" IS NULL AND "app"."channel_bindings"."browser_device_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_bindings_one_live_per_chat" ON "app"."channel_bindings" USING btree ("telegram_chat_id","patient_ref_id") WHERE "app"."channel_bindings"."revoked_at" IS NULL AND "app"."channel_bindings"."telegram_chat_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "consent_records_fingerprint_idx" ON "app"."consent_records" USING btree ("cedula_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "otp_challenges_one_live_per_fingerprint" ON "app"."otp_challenges" USING btree ("cedula_fingerprint") WHERE "app"."otp_challenges"."consumed_at" IS NULL AND "app"."otp_challenges"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "otp_challenges_fingerprint_created_idx" ON "app"."otp_challenges" USING btree ("cedula_fingerprint","created_at");