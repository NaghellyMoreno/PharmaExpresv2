import type { Pool } from 'pg';
import type { EmailSender, SmsSender } from './messaging';

/**
 * Modo `capture` (ADR 0009): no sale nada. Cada mensaje queda en `app.captured_messages`, tabla de prueba que la
 * migración solo crea fuera de producción, para que las pruebas lean el texto enviado (invariante 1).
 */
export class CaptureSmsSender implements SmsSender {
  constructor(private readonly pool: Pool) {}

  async send(to: string, body: string): Promise<void> {
    await this.pool.query('INSERT INTO app.captured_messages (channel, destination, body) VALUES ($1, $2, $3)', ['sms', to, body]);
  }
}

export class CaptureEmailSender implements EmailSender {
  constructor(private readonly pool: Pool) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.pool.query('INSERT INTO app.captured_messages (channel, destination, subject, body) VALUES ($1, $2, $3, $4)', [
      'email',
      to,
      subject,
      body,
    ]);
  }
}
