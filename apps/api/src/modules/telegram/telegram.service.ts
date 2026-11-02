import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Bot, GrammyError, HttpError, InlineKeyboard, type Context, webhookCallback } from 'grammy';
import type { Pool } from 'pg';
import { CLOCK, type Clock } from '../../common/clock';
import { PG_POOL } from '../../db/db.module';
import { telegramChats } from '../../db/schema';
import { type Declarant } from '../identity/consent-cookie.service';
import { IdentityService } from '../identity/identity.service';
import { PRIVACY_NOTICE } from '../identity/privacy-notice';
import { OtpNotifier } from '../notifications/otp-notifier.service';
import { BOT_TEXTS, CALLBACKS } from './texts';
import { CAPTURE_BOT_INFO, TELEGRAM_TRANSPORT, type TelegramTransport } from './telegram-transport';

const START_COMMAND = /^\/start(@\w+)?(\s|$)/;
const CEDULA = /^[0-9]{5,12}$/;
const CODE = /^[0-9]{6}$/;

/** Lo único que el chat guarda de la conversación: nunca la cédula, el código ni datos de contacto. */
interface Conversation {
  step: 'awaiting_cedula' | 'awaiting_code' | 'verified';
  challengeId?: string;
  /** Reto ya consumido: en `verified` un código de 6 dígitos se compara con él y recibe "Código ya usado". */
  lastChallengeId?: string;
  pendingAcceptance: { noticeVersion: string; declarant: Declarant; acceptedAt: string };
}
interface ChatRow {
  id: string;
  conversation: Conversation;
}

/** Bot de Telegram por webhook (ADR 0008). F002: aviso de privacidad, aceptar o rechazar. */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly db;
  private handler?: (req: Request, res: Response) => Promise<unknown>;

  constructor(
    @Inject(PG_POOL) pool: Pool,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TELEGRAM_TRANSPORT) private readonly transport: TelegramTransport,
    private readonly identity: IdentityService,
    private readonly notifier: OtpNotifier,
  ) {
    this.db = drizzle(pool);
  }

  /** Atiende una petición que ya pasó la verificación del secreto. Siempre responde 200. */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      if (!isUpdate(req.body)) return void res.status(200).end();
      await this.getHandler()(req, res);
    } catch (error) {
      // Nunca se registra el contenido de la actualización ni el mensaje del error (invariante 8, RNF-013).
      this.logger.error(`Error al procesar una actualización de Telegram (${describeError(error)})`);
    }
    if (!res.headersSent) res.status(200).end();
  }

  private getHandler() {
    if (!this.handler) {
      const capture = process.env.MESSAGING_MODE === 'capture';
      const token = process.env.TELEGRAM_BOT_TOKEN || (capture ? 'capture-token' : '');
      if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
      // botInfo evita llamar a getMe en cada arranque en frío; en producción se pasa al conocerlo (F090).
      const bot = new Bot(token, capture ? { botInfo: CAPTURE_BOT_INFO } : {});
      this.transport.install(bot);
      bot.on('message', (ctx) => this.onMessage(ctx));
      bot.on('callback_query:data', (ctx) => this.onButton(ctx));
      bot.catch((err) => this.logger.error(`Error en el bot de Telegram (${describeError(err.error)})`));
      this.handler = webhookCallback(bot, 'express', { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET });
    }
    return this.handler;
  }

  /**
   * Un chat nuevo recibe el aviso. Uno que ya aceptó atiende el texto según su paso; los mensajes que no son texto
   * (foto, documento, sticker) no se procesan, no se responden y no se guardan.
   */
  private async onMessage(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const value = ctx.message?.text;
    if (value !== undefined) {
      const chat = await this.claimUpdate(chatId, ctx.update.update_id);
      if (chat) return this.onText(ctx, chat, value);
    }
    if (await this.chatExists(chatId)) return;
    const keyboard = new InlineKeyboard()
      .text(BOT_TEXTS.acceptHolder, CALLBACKS.acceptHolder)
      .row()
      .text(BOT_TEXTS.acceptThirdParty, CALLBACKS.acceptThirdParty)
      .row()
      .text(BOT_TEXTS.reject, CALLBACKS.reject)
      .row()
      .text(BOT_TEXTS.revoke, CALLBACKS.revoke);
    await this.send(ctx, BOT_TEXTS.notice, keyboard);
  }

  /** Atiende un texto de un chat que ya aceptó el aviso, según el paso guardado. */
  private async onText(ctx: Context, chat: ChatRow, value: string): Promise<void> {
    if (START_COMMAND.test(value)) {
      // Vuelve a pedir la cédula sin tocar la aceptación original (y descarta el reto sin consumirlo).
      await this.db.execute(sql`UPDATE telegram_chats
        SET conversation = jsonb_build_object('step', 'awaiting_cedula', 'pendingAcceptance', conversation->'pendingAcceptance')
        WHERE id = ${chat.id}`);
      return this.send(ctx, BOT_TEXTS.askCedula);
    }
    const trimmed = value.trim();
    if (chat.conversation.step === 'awaiting_code') {
      if (!CODE.test(trimmed)) return this.send(ctx, BOT_TEXTS.codeIncomplete);
      return this.verifyCode(ctx, chat, chat.conversation.challengeId, trimmed);
    }
    if (chat.conversation.step === 'verified') {
      // Un código de 6 dígitos se compara con el reto ya consumido; cualquier otro texto no tiene respuesta (use /start).
      if (CODE.test(trimmed)) return this.verifyCode(ctx, chat, chat.conversation.lastChallengeId, trimmed);
      return;
    }
    return this.requestCode(ctx, chat, trimmed);
  }

  /**
   * Verifica el código con el mismo servicio de la web. Si es correcto, en una sola transacción: consume el reto, crea
   * al paciente, registra la aceptación guardada al aceptar (R-29) y vincula el chat. Solo la cédula y el código
   * verifican (invariante 4): el identificador del chat no prueba nada.
   */
  private async verifyCode(ctx: Context, chat: ChatRow, challengeId: string | undefined, code: string): Promise<void> {
    try {
      const pending = chat.conversation.pendingAcceptance;
      await this.identity.verifyChallenge(challengeId ?? '', code, {
        consent: { ...pending, channel: 'telegram' },
        link: async (c, { patientRefId }) => {
          await this.identity.resolveBinding(c, { column: 'telegram_chat_id', id: chat.id }, patientRefId);
          await c.query(
            `UPDATE telegram_chats
             SET conversation = jsonb_build_object('step', 'verified', 'lastChallengeId', $2::text,
                                                   'pendingAcceptance', conversation->'pendingAcceptance'),
                 updated_at = app.clock_now()
             WHERE id = $1`,
            [chat.id, challengeId],
          );
        },
      });
    } catch (error) {
      return this.send(ctx, this.verificationFailure(error));
    }
    await this.send(ctx, BOT_TEXTS.verified);
  }

  /** Un código incorrecto y uno ya usado tienen su mensaje; vencido, sin intentos o un fallo del sistema, el genérico. */
  private verificationFailure(error: unknown): string {
    const body = error instanceof HttpException ? (error.getResponse() as { code?: string }) : null;
    if (body?.code === 'code_incorrect') return BOT_TEXTS.codeIncorrect;
    if (body?.code === 'code_superseded') return BOT_TEXTS.codeUsed;
    if (!body) this.logger.error(`No se pudo verificar el código (${describeError(error)})`);
    return BOT_TEXTS.codeNotVerified;
  }

  /** Pide el código al servicio de identidad y responde el mensaje aprobado, exista o no la cédula (RNF-032). */
  private async requestCode(ctx: Context, chat: ChatRow, cedula: string): Promise<void> {
    if (!CEDULA.test(cedula)) return this.send(ctx, BOT_TEXTS.cedulaInvalid);
    let delivery;
    try {
      const requested = await this.identity.requestCode(cedula);
      delivery = requested.delivery;
      await this.db.execute(sql`UPDATE telegram_chats
        SET conversation = jsonb_build_object('step', 'awaiting_code', 'challengeId', ${requested.challengeId}::text,
                                              'pendingAcceptance', conversation->'pendingAcceptance')
        WHERE id = ${chat.id}`);
    } catch (error) {
      // Un 429 (espera de 2 minutos o límite por hora) es esperado: no crea reto ni envía nada y el chat sigue en awaiting_cedula.
      if (!(error instanceof HttpException && error.getStatus() === 429)) {
        this.logger.error(`No se pudo pedir el código de verificación (${describeError(error)})`);
      }
      return this.send(ctx, BOT_TEXTS.codeNotSent);
    }
    await this.send(ctx, BOT_TEXTS.codeRequested);
    // El envío ocurre después de responder (ADR 0008, decisión 3); el notificador nunca lanza.
    if (delivery) waitUntil(this.notifier.send(delivery));
  }

  private async onButton(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const data = ctx.callbackQuery?.data;
    if (chatId === undefined) return;
    switch (data) {
      case CALLBACKS.acceptHolder:
        return this.accept(ctx, chatId, 'holder');
      case CALLBACKS.acceptThirdParty:
        return this.accept(ctx, chatId, 'third_party');
      case CALLBACKS.reject:
        // Rechazar no guarda nada. Si el chat ya había aceptado, retirar la aceptación es la revocación.
        if (!(await this.chatExists(chatId))) await this.send(ctx, BOT_TEXTS.rejected);
        return;
      case CALLBACKS.revoke:
        return void (await this.send(ctx, BOT_TEXTS.revokePlaceholder));
      default:
        return;
    }
  }

  /**
   * Única escritura de F002: la fila mínima del chat. La restricción única de `chat_id` decide cuando
   * dos aceptaciones llegan a la vez: solo quien inserta la fila envía el mensaje de la cédula.
   */
  private async accept(ctx: Context, chatId: number, declarant: Declarant): Promise<void> {
    const acceptedAt = (await this.clock.now()).toISOString();
    const created = await this.db
      .insert(telegramChats)
      .values({
        chatId,
        lastUpdateId: ctx.update.update_id,
        updatedAt: new Date(acceptedAt),
        conversation: {
          step: 'awaiting_cedula',
          pendingAcceptance: { noticeVersion: PRIVACY_NOTICE.version, declarant, acceptedAt },
        },
      })
      .onConflictDoNothing({ target: telegramChats.chatId })
      .returning({ id: telegramChats.id });
    if (created.length === 1) await this.send(ctx, BOT_TEXTS.askCedula);
  }

  private async chatExists(chatId: number): Promise<boolean> {
    const rows = await this.db.select({ id: telegramChats.id }).from(telegramChats).where(eq(telegramChats.chatId, chatId));
    return rows.length > 0;
  }

  /**
   * Toma la actualización: solo la primera vez que llega un `update_id` (ADR 0008, decisión 4). Devuelve la fila del chat,
   * o nada si es un reintento o el chat no existe. Solo se descarta el mismo `update_id`: dos actualizaciones distintas que
   * llegan juntas se atienden las dos y las serializa el bloqueo del reto.
   */
  private async claimUpdate(chatId: number, updateId: number): Promise<ChatRow | null> {
    const rows = await this.db
      .update(telegramChats)
      .set({ lastUpdateId: updateId, updatedAt: await this.clock.now() })
      .where(sql`${telegramChats.chatId} = ${chatId} AND ${telegramChats.lastUpdateId} IS DISTINCT FROM ${updateId}`)
      .returning({ id: telegramChats.id, conversation: telegramChats.conversation });
    return rows.length === 1 ? { id: rows[0].id, conversation: rows[0].conversation as Conversation } : null;
  }

  /** Responde solo al chat que escribió (RNF-019). Si Telegram falla, el webhook igual responde 200. */
  private async send(ctx: Context, text: string, keyboard?: InlineKeyboard): Promise<void> {
    try {
      await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
    } catch (error) {
      this.logger.error(`No se pudo enviar el mensaje por Telegram (${describeError(error)})`);
    }
  }
}

function isUpdate(body: unknown): body is { update_id: number } {
  return typeof body === 'object' && body !== null && Number.isSafeInteger((body as { update_id?: unknown }).update_id);
}

/** Solo el tipo de error y el código: el mensaje puede traer el token o el contenido del chat. */
function describeError(error: unknown): string {
  if (error instanceof GrammyError) return `GrammyError ${error.error_code}`;
  if (error instanceof HttpError) return 'HttpError de red';
  return error instanceof Error ? error.name : 'error desconocido';
}
