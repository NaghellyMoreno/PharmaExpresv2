import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';
import { CaptureEmailSender, CaptureSmsSender } from './capture-messaging';
import { EMAIL_SENDER, SMS_SENDER, UnavailableSender } from './messaging';
import { OtpNotifier } from './otp-notifier.service';

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
