import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module.js';
import { CaptureEmailSender, CaptureSmsSender } from './capture-messaging.js';
import { EMAIL_SENDER, SMS_SENDER, UnavailableSender } from './messaging.js';
import { OtpNotifier } from './otp-notifier.service.js';

const capture = () => process.env.MESSAGING_MODE === 'capture';

@Module({
  providers: [
    OtpNotifier,
    { provide: SMS_SENDER, inject: [PG_POOL], useFactory: (pool: Pool) => (capture() ? new CaptureSmsSender(pool) : new UnavailableSender('sms')) },
    { provide: EMAIL_SENDER, inject: [PG_POOL], useFactory: (pool: Pool) => (capture() ? new CaptureEmailSender(pool) : new UnavailableSender('email')) },
  ],
  exports: [OtpNotifier],
})
export class NotificationsModule {}
