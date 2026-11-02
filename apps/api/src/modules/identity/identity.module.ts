import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsentCookieGuard } from './consent-cookie.guard';
import { ConsentCookieService } from './consent-cookie.service';
import { ConsentController } from './consent.controller';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ConsentController, IdentityController],
  providers: [
    { provide: ConsentCookieService, useFactory: () => new ConsentCookieService(process.env.CONSENT_COOKIE_KEY ?? '') },
    ConsentCookieGuard,
    IdentityService,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
