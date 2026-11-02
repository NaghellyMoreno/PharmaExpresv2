import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './common/access.js';
import { ClockModule } from './common/clock.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';

@Module({
  imports: [DbModule, ClockModule, IdentityModule, TelegramModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
