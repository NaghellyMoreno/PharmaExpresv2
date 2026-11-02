import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';
import {
  CaptureTelegramTransport,
  RealTelegramTransport,
  TELEGRAM_TRANSPORT,
  type TelegramTransport,
} from './telegram-transport.js';

@Module({
  imports: [IdentityModule, NotificationsModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    {
      provide: TELEGRAM_TRANSPORT,
      useFactory: (): TelegramTransport =>
        process.env.MESSAGING_MODE === 'capture' ? new CaptureTelegramTransport() : new RealTelegramTransport(),
    },
  ],
})
export class TelegramModule {}
