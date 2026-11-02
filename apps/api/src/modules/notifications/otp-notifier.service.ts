import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_SENDER, SMS_SENDER, type EmailSender, type SmsSender } from './messaging.js';
import { renderOtpEmail, renderOtpSms } from './otp-templates.js';

export interface OtpDelivery {
  code: string;
  mobilePhone: string;
  email: string | null;
}

/** Envía el código por SMS y, si el afiliado tiene correo, también por correo. Nunca lanza. */
@Injectable()
export class OtpNotifier {
  private readonly logger = new Logger(OtpNotifier.name);

  constructor(
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async send(delivery: OtpDelivery): Promise<void> {
    const tasks: Array<[string, Promise<void>]> = [];
    // Se llama a cada adaptador dentro de un try, para que un fallo síncrono tampoco escape.
    const start = (channel: string, run: () => Promise<void>) => tasks.push([channel, run().catch((e: unknown) => this.fail(channel, e))]);
    start('sms', async () => this.sms.send(delivery.mobilePhone, renderOtpSms(delivery.code)));
    if (delivery.email) {
      const { subject, body } = renderOtpEmail(delivery.code);
      const to = delivery.email;
      start('correo', async () => this.email.send(to, subject, body));
    }
    await Promise.all(tasks.map(([, p]) => p));
  }

  /** Solo el canal y el tipo de error: ni destinatario ni cuerpo (invariante 8, ADR 0009 punto 8). */
  private fail(channel: string, error: unknown): void {
    const kind = error instanceof Error ? error.constructor.name : 'desconocido';
    this.logger.error(`No se pudo enviar el código de verificación (canal ${channel}, error ${kind})`);
  }
}
