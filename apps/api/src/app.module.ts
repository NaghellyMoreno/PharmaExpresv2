import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './common/access';
import { DbModule } from './db/db.module';
import { HealthController } from './modules/health/health.controller';
import { IdentityModule } from './modules/identity/identity.module';

@Module({
  imports: [DbModule, IdentityModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
