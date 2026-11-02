import { createHmac, timingSafeEqual } from 'node:crypto';
import type { components } from '@pharma/api-contract';

export const CONSENT_COOKIE_NAME = '__Host-pe_consent';

export type Declarant = components['schemas']['Declarant'];

/** Carga útil de la cookie: sin cédula ni ningún otro dato personal (invariantes 1 y 8). */
export interface ConsentPayload {
  noticeVersion: string;
  declarant: Declarant;
  channel: 'web';
  acceptedAt: string;
}

const b64 = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** Cookie firmada: base64url(JSON) + "." + base64url(HMAC-SHA-256 con CONSENT_COOKIE_KEY). */
export class ConsentCookieService {
  constructor(private readonly key: string) {
    if (!key) throw new Error('Falta CONSENT_COOKIE_KEY');
  }

  private signature(encodedPayload: string): Buffer {
    return createHmac('sha256', this.key).update(encodedPayload).digest();
  }

  sign(payload: ConsentPayload): string {
    const encoded = b64(JSON.stringify(payload));
    return `${encoded}.${b64(this.signature(encoded))}`;
  }

  /** Devuelve la carga útil si la firma es válida; si no, null. */
  verify(value: string): ConsentPayload | null {
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const given = Buffer.from(sig, 'base64url');
    const expected = this.signature(encoded);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ConsentPayload;
      return p && p.channel === 'web' ? p : null;
    } catch {
      return null;
    }
  }
}
