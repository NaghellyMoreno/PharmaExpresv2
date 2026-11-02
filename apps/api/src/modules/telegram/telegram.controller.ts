import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TelegramWebhook } from '../../common/access';
import { TelegramService } from './telegram.service';

@Controller()
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** El guard global verifica el secreto antes de llegar aquí; sin él responde 401 sin efectos. */
  @TelegramWebhook()
  @Post('telegram/webhook')
  @HttpCode(200)
  async receiveTelegramUpdate(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.telegram.handleWebhook(req, res);
  }
}
