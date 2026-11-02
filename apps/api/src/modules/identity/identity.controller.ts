import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import type { components } from '@pharma/api-contract';
import { OtpNotifier } from '../notifications/otp-notifier.service';
import { PublicWithConsent } from './consent-cookie.guard';
import { IdentityService } from './identity.service';
import { CedulaDto } from './identity.dto';
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
}
