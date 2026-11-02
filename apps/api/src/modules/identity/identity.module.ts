import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ChannelSessionController } from './channel-session.controller.js';
import { ConsentCookieGuard } from './consent-cookie.guard.js';
import { ConsentCookieService } from './consent-cookie.service.js';
import { ConsentController } from './consent.controller.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ConsentController, IdentityController, ChannelSessionController],
  providers: [
    { provide: ConsentCookieService, useFactory: () => new ConsentCookieService(process.env.CONSENT_COOKIE_KEY ?? '') },
    ConsentCookieGuard,
    IdentityService,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
