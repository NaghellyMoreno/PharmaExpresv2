import { Module } from '@nestjs/common';
import { CLOCK, DbClock } from '../../common/clock';
import { ConsentCookieService } from './consent-cookie.service';
import { ConsentController } from './consent.controller';

@Module({
  controllers: [ConsentController],
  providers: [
    { provide: CLOCK, useClass: DbClock },
    { provide: ConsentCookieService, useFactory: () => new ConsentCookieService(process.env.CONSENT_COOKIE_KEY ?? '') },
  ],
})
export class IdentityModule {}
