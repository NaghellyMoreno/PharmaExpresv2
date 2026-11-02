import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import {
  CaptureTelegramTransport,
  RealTelegramTransport,
  TELEGRAM_TRANSPORT,
  type TelegramTransport,
} from './telegram-transport';

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
