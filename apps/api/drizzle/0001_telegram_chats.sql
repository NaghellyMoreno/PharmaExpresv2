-- F002: chats de Telegram que aceptaron el aviso (invariante 3: solo se crea al aceptar).
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" bigint NOT NULL,
	"conversation" jsonb NOT NULL,
	"last_update_id" bigint,
	"updated_at" timestamp with time zone DEFAULT app.clock_now() NOT NULL,
	CONSTRAINT "telegram_chats_chat_id_unique" UNIQUE("chat_id")
);
