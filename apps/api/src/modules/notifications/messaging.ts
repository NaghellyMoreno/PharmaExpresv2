/** Puertos de salida de SMS y correo (ADR 0009). El dominio no conoce al proveedor. */
export const SMS_SENDER = Symbol('SMS_SENDER');
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

/**
 * Sin proveedor real configurado (textbee y Resend llegan con la configuración externa de ADR 0009):
 * falla de forma explícita en lugar de fingir un envío. El mensaje no lleva destinatario ni cuerpo.
 */
export class UnavailableSender implements SmsSender, EmailSender {
  constructor(private readonly channel: 'sms' | 'email') {}

  async send(): Promise<void> {
    throw new Error(`Proveedor de ${this.channel} no configurado`);
  }
}
