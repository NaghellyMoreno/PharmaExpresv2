import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

function requireEnv(name: 'CEDULA_FINGERPRINT_KEY' | 'OTP_PEPPER'): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

/** Huella de la cédula: HMAC-SHA-256 con clave secreta (R-24). La cédula nunca se guarda. */
export function cedulaFingerprint(cedula: string): string {
  return createHmac('sha256', requireEnv('CEDULA_FINGERPRINT_KEY')).update(cedula).digest('hex');
}

/** Código de 6 dígitos con ceros a la izquierda (ADR 0006, decisión 1). `rand` solo se cambia en pruebas. */
export function generateOtpCode(rand: (min: number, max: number) => number = randomInt): string {
  return String(rand(0, 1_000_000)).padStart(6, '0');
}

/** `HMAC-SHA-256(OTP_PEPPER, challengeId || código)` (ADR 0006, decisión 2). */
export function hashOtpCode(challengeId: string, code: string): string {
  return createHmac('sha256', requireEnv('OTP_PEPPER')).update(challengeId + code).digest('hex');
}

/** Comparación en tiempo constante de dos hashes en hexadecimal. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token aleatorio de 32 bytes para la cookie del dispositivo y el token CSRF (ADR 0007). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Solo se guarda el hash SHA-256 del token (ADR 0007). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
