import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './common/access';
import { ClockModule } from './common/clock.module';
import { DbModule } from './db/db.module';
import { HealthController } from './modules/health/health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [DbModule, ClockModule, IdentityModule, TelegramModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
