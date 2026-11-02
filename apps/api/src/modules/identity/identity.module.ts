import { Module } from '@nestjs/common';
import { ConsentCookieService } from './consent-cookie.service';
import { ConsentController } from './consent.controller';

@Module({
  controllers: [ConsentController],
  providers: [
    { provide: ConsentCookieService, useFactory: () => new ConsentCookieService(process.env.CONSENT_COOKIE_KEY ?? '') },
  ],
})
export class IdentityModule {}
