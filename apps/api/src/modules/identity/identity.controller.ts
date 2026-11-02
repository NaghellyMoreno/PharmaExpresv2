import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import type { components } from '@pharma/api-contract';
import type { Request, Response } from 'express';
import { OtpNotifier } from '../notifications/otp-notifier.service';
import { Consent, PublicWithConsent } from './consent-cookie.guard';
import type { ConsentPayload } from './consent-cookie.service';
import { DEVICE_COOKIE_NAME, readCookie } from './cookies';
import { IdentityService } from './identity.service';
import { CedulaDto, OtpVerificationDto } from './identity.dto';
import { OTP_REQUEST_MESSAGE, RESEND_AVAILABLE_IN_SECONDS } from './messages';

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly notifier: OtpNotifier,
  ) {}

  /** Responde igual exista o no la cédula (RNF-032); el envío ocurre después de responder (ADR 0006, decisión 4). */
  @PublicWithConsent()
  @Post('otp-requests')
  @HttpCode(202)
  async requestVerificationCode(@Body() dto: CedulaDto): Promise<components['schemas']['OtpRequestAccepted']> {
    const { challengeId, delivery } = await this.identity.requestCode(dto.cedula);
    if (delivery) waitUntil(this.notifier.send(delivery));
    return { challengeId, message: OTP_REQUEST_MESSAGE, resendAvailableInSeconds: RESEND_AVAILABLE_IN_SECONDS };
  }

  @PublicWithConsent()
  @Post('verifications')
  @HttpCode(200)
  async verifyIdentity(
    @Body() dto: OtpVerificationDto,
    @Consent() consent: ConsentPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<components['schemas']['VerificationResult']> {
    const { binding, csrfToken, device } = await this.identity.verify(dto.challengeId, dto.code, consent, readCookie(req, DEVICE_COOKIE_NAME));
    res.cookie(DEVICE_COOKIE_NAME, device.token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: device.expires });
    return { binding, csrfToken };
  }
}
