import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import {
  CaptureTelegramTransport,
  RealTelegramTransport,
  TELEGRAM_TRANSPORT,
  type TelegramTransport,
} from './telegram-transport';

@Module({
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
