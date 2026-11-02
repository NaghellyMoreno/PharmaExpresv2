import type { NestExpressApplication } from '@nestjs/platform-express';
import { OtpNotifier } from '../../src/modules/notifications/otp-notifier.service';

/**
 * El envío ocurre después de responder. Para que ningún envío pendiente de una prueba caiga en la siguiente,
 * se guardan las promesas de `OtpNotifier.send` y `flush()` las espera.
 */
export function trackSends(app: NestExpressApplication) {
  const notifier = app.get(OtpNotifier);
  const original = notifier.send.bind(notifier);
  const pending: Promise<void>[] = [];
  notifier.send = (delivery) => {
    const p = original(delivery);
    pending.push(p);
    return p;
  };
  return {
    async flush() {
      await Promise.all(pending.splice(0));
    },
  };
}
