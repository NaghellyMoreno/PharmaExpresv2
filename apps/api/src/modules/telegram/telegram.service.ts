import { Inject, Injectable, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Bot, GrammyError, HttpError, InlineKeyboard, type Context, webhookCallback } from 'grammy';
import type { Pool } from 'pg';
import { CLOCK, type Clock } from '../../common/clock';
import { PG_POOL } from '../../db/db.module';
import { telegramChats } from '../../db/schema';
import { type Declarant } from '../identity/consent-cookie.service';
import { PRIVACY_NOTICE } from '../identity/privacy-notice';
import { BOT_TEXTS, CALLBACKS } from './texts';
import { CAPTURE_BOT_INFO, TELEGRAM_TRANSPORT, type TelegramTransport } from './telegram-transport';

const START_COMMAND = /^\/start(@\w+)?(\s|$)/;

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

  /** Cualquier mensaje: un chat nuevo recibe el aviso; uno que ya aceptó, solo con /start recibe la cédula. */
  private async onMessage(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    if (await this.chatExists(chatId)) {
      if (START_COMMAND.test(ctx.message?.text ?? '') && (await this.claimUpdate(chatId, ctx.update.update_id))) {
        await this.send(ctx, BOT_TEXTS.askCedula);
      }
      return;
    }
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

  /** Descarta la actualización repetida de un chat con fila (ADR 0008, decisión 4). */
  private async claimUpdate(chatId: number, updateId: number): Promise<boolean> {
    const rows = await this.db
      .update(telegramChats)
      .set({ lastUpdateId: updateId, updatedAt: await this.clock.now() })
      .where(sql`${telegramChats.chatId} = ${chatId} AND (${telegramChats.lastUpdateId} IS NULL OR ${telegramChats.lastUpdateId} < ${updateId})`)
      .returning({ id: telegramChats.id });
    return rows.length === 1;
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
