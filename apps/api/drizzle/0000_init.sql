-- Migración inicial (ADR 0003 y 0021): esquemas y reloj de la aplicación.
-- Toda hora de negocio sale de app.clock_now(), nunca de now() ni CURRENT_TIMESTAMP.
CREATE SCHEMA IF NOT EXISTS "sim";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE TABLE "app"."test_clock" (
	"id" smallint PRIMARY KEY NOT NULL,
	"offset_seconds" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "test_clock_single_row" CHECK ("id" = 1),
	CONSTRAINT "test_clock_offset_non_negative" CHECK ("offset_seconds" >= 0)
);
--> statement-breakpoint
INSERT INTO "app"."test_clock" ("id", "offset_seconds") VALUES (1, 0);
--> statement-breakpoint
CREATE FUNCTION "app"."clock_now"() RETURNS timestamptz
LANGUAGE sql STABLE
AS $$ SELECT now() + make_interval(secs => (SELECT offset_seconds FROM app.test_clock WHERE id = 1)) $$;
--> statement-breakpoint
CREATE FUNCTION "app"."test_clock_guard"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.offset_seconds <> 0 AND current_setting('pharma.environment', true) = 'production' THEN
    RAISE EXCEPTION 'El reloj de prueba no puede moverse en producción';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "test_clock_guard" BEFORE INSERT OR UPDATE ON "app"."test_clock"
FOR EACH ROW EXECUTE FUNCTION "app"."test_clock_guard"();
