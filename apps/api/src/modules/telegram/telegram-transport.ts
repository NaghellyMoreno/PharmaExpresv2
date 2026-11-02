import type { Bot } from 'grammy';
import { HttpError } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';

export const TELEGRAM_TRANSPORT = Symbol('TELEGRAM_TRANSPORT');

/** Salida hacia Telegram: la real usa la red; la de pruebas guarda cada llamada (ADR 0008, decisión 11). */
export interface TelegramTransport {
  install(bot: Bot): void;
}

export class RealTelegramTransport implements TelegramTransport {
  install(): void {
    // grammY llama a api.telegram.org con el token del bot.
  }
}

export interface RecordedCall {
  method: string;
  /** Destino de la llamada; `undefined` si el método no tiene chat. */
  chatId?: number;
  text?: string;
  replyMarkup?: unknown;
  /** Claves del cuerpo enviado: permite comprobar que el bot no cita ni repite lo que escribió el usuario. */
  keys: string[];
}

/** Modo `capture`: no sale ninguna llamada a Telegram; solo se registran el método y el destino. */
export class CaptureTelegramTransport implements TelegramTransport {
  readonly calls: RecordedCall[] = [];
  private failure: { kind: 'server' | 'network'; description: string } | null = null;

  /** Las llamadas siguientes fallan hasta `clearFailure()`. */
  failWith(kind: 'server' | 'network', description = 'Fallo simulado'): void {
    this.failure = { kind, description };
  }

  clearFailure(): void {
    this.failure = null;
  }

  reset(): void {
    this.calls.length = 0;
    this.failure = null;
  }

  install(bot: Bot): void {
    bot.api.config.use(async (_prev, method, payload) => {
      const p = payload as { chat_id?: number | string; text?: string; reply_markup?: unknown };
      this.calls.push({
        method,
        chatId: typeof p.chat_id === 'number' ? p.chat_id : undefined,
        text: p.text,
        replyMarkup: p.reply_markup,
        keys: Object.keys(p),
      });
      if (this.failure?.kind === 'network') {
        throw new HttpError(this.failure.description, new Error(this.failure.description));
      }
      if (this.failure?.kind === 'server') {
        return { ok: false, error_code: 500, description: this.failure.description } as never;
      }
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: p.chat_id, type: 'private' } } } as never;
    });
  }
}

/** Datos de bot ficticios para no llamar a getMe en modo `capture`. */
export const CAPTURE_BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'Bot de pruebas',
  username: 'pharma_express_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as unknown as UserFromGetMe;
