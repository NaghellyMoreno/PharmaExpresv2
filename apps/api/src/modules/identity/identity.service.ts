import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';
import { withTransaction } from '../../db/transaction';
import type { OtpDelivery } from '../notifications/otp-notifier.service';
import { cedulaFingerprint, generateOtpCode, hashOtpCode } from './identity-crypto';

export interface CodeRequestResult {
  challengeId: string;
  /** Solo si la cédula está afiliada; se envía después de responder. */
  delivery: OtpDelivery | null;
}

/** Casos de uso del código de un solo uso y de la verificación de identidad (ADR 0006). */
@Injectable()
export class IdentityService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Crea el reto. El resultado no depende de que la cédula exista: sin afiliado el reto se guarda sin código
   * y no se envía nada (ADR 0006, decisión 4). No crea cuenta ni consentimiento (invariante 3).
   */
  async requestCode(cedula: string): Promise<CodeRequestResult> {
    const fingerprint = cedulaFingerprint(cedula);
    return withTransaction(this.pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [fingerprint]);
      const { rows } = await c.query<{ mobile_phone: string; email: string | null }>(
        'SELECT mobile_phone, email FROM sim.affiliates WHERE cedula = $1',
        [cedula],
      );
      const affiliate = rows[0];
      // Un código nuevo anula el vigente de la misma huella (ADR 0006, decisión 6).
      await c.query(
        `UPDATE app.otp_challenges SET superseded_at = app.clock_now()
         WHERE cedula_fingerprint = $1 AND consumed_at IS NULL AND superseded_at IS NULL`,
        [fingerprint],
      );
      const challengeId = randomUUID();
      const code = affiliate ? generateOtpCode() : null;
      await c.query(
        `INSERT INTO app.otp_challenges (id, cedula_fingerprint, purpose, code_hash, expires_at)
         VALUES ($1, $2, 'verify', $3, app.clock_now() + interval '10 minutes')`,
        [challengeId, fingerprint, code ? hashOtpCode(challengeId, code) : null],
      );
      return {
        challengeId,
        delivery: affiliate && code ? { code, mobilePhone: affiliate.mobile_phone, email: affiliate.email } : null,
      };
    });
  }
}
