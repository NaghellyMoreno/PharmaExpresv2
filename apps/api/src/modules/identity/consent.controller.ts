import { Body, ConflictException, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/access.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { CONSENT_COOKIE_NAME, ConsentCookieService } from './consent-cookie.service.js';
import { ConsentAcceptanceDto } from './consent.dto.js';
import { PRIVACY_NOTICE, type PrivacyNotice } from './privacy-notice.js';

@Controller()
export class ConsentController {
  constructor(
    private readonly cookies: ConsentCookieService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Public()
  @Get('privacy-notice')
  getPrivacyNotice(): PrivacyNotice {
    return PRIVACY_NOTICE;
  }

  /** No escribe en la base de datos (invariante 3): solo emite la cookie firmada. */
  @Public({ checkOrigin: true })
  @Post('consents/acceptance')
  @HttpCode(204)
  async acceptPrivacyNotice(@Body() dto: ConsentAcceptanceDto, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (dto.noticeVersion !== PRIVACY_NOTICE.version) {
      throw new ConflictException({ code: 'notice_version_outdated', title: 'El aviso de privacidad cambió' });
    }
    const acceptedAt = (await this.clock.now()).toISOString();
    const value = this.cookies.sign({
      noticeVersion: dto.noticeVersion,
      declarant: dto.declarant,
      channel: 'web',
      acceptedAt,
    });
    // Cookie de sesión (sin Max-Age) y sin Domain, como exige el prefijo __Host-.
    res.cookie(CONSENT_COOKIE_NAME, value, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  }
}
