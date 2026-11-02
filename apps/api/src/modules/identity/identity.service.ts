import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { components } from '@pharma/api-contract';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../db/db.module';
import { withTransaction } from '../../db/transaction';
import type { OtpDelivery } from '../notifications/otp-notifier.service';
import type { ConsentPayload } from './consent-cookie.service';
import { cedulaFingerprint, generateOtpCode, hashOtpCode, hashToken, newToken, sameHash } from './identity-crypto';

type Binding = components['schemas']['Binding'];

const MAX_ATTEMPTS = 3;

export interface CodeRequestResult {
  challengeId: string;
  /** Solo si la cédula está afiliada; se envía después de responder. */
  delivery: OtpDelivery | null;
}

export interface VerificationOutcome {
  binding: Binding;
  csrfToken: string;
  /** Token en claro de la cookie `__Host-pe_device` y su vencimiento (el de la vinculación más tardía). */
  device: { token: string; expires: Date };
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: HttpException };

/** Lo que cada canal aporta a la verificación: la aceptación guardada y cómo vincular al paciente. */
export interface ChannelVerification<T> {
  consent: { declarant: ConsentPayload['declarant']; noticeVersion: string; acceptedAt: string; channel: 'web' | 'telegram' };
  /** Corre dentro de la transacción de la verificación: si lanza, se revierte todo, incluido el consumo del reto. */
  link(c: PoolClient, verified: { patientRefId: string; fingerprint: string; fullName: string }): Promise<T>;
}

/** Dueño de una vinculación: un navegador (web) o un chat de Telegram (ADR 0007). */
export type BindingOwner = { column: 'browser_device_id' | 'telegram_chat_id'; id: string };

const wrongCode = (attemptsRemaining: number) =>
  new HttpException({ code: 'code_incorrect', title: 'El código no es correcto', attemptsRemaining }, 422);
const codeGone = (code: 'code_superseded' | 'code_expired' | 'code_attempts_exhausted', title: string) =>
  new HttpException({ code, title }, 410);

/** Casos de uso del código de un solo uso y de la verificación de identidad (ADR 0006 y 0007). */
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

  /** Verificación desde la web: el canal aporta la cookie de consentimiento y el dispositivo del navegador. */
  async verify(challengeId: string, code: string, consent: ConsentPayload, deviceToken: string | null): Promise<VerificationOutcome> {
    return this.verifyChallenge(challengeId, code, {
      consent: { declarant: consent.declarant, noticeVersion: consent.noticeVersion, acceptedAt: consent.acceptedAt, channel: 'web' },
      link: async (c, { patientRefId, fingerprint, fullName }) => {
        const { token, deviceId, csrfToken } = await this.resolveDevice(c, deviceToken);
        const bindingExpiresAt = await this.resolveBinding(c, { column: 'browser_device_id', id: deviceId }, patientRefId);
        const latest = await c.query<{ expires_at: Date }>(
          `SELECT max(expires_at) AS expires_at FROM app.channel_bindings
           WHERE browser_device_id = $1 AND revoked_at IS NULL AND expires_at > app.clock_now()`,
          [deviceId],
        );
        const health = await c.query(
          "SELECT 1 FROM app.consent_records WHERE cedula_fingerprint = $1 AND kind = 'health_data' LIMIT 1",
          [fingerprint],
        );
        return {
          binding: {
            patientRefId,
            displayName: fullName,
            expiresAt: bindingExpiresAt.toISOString(),
            hasHealthDataAuthorization: (health.rowCount ?? 0) > 0,
          },
          csrfToken,
          device: { token, expires: latest.rows[0].expires_at },
        };
      },
    });
  }

  /**
   * Verifica el código, igual para cualquier canal. Si es correcto, en una sola transacción: consume el reto, crea la
   * referencia del paciente, registra la aceptación (con la fecha guardada al aceptar, R-29) y deja que el canal vincule.
   * Si algo falla, no queda nada. Un código incorrecto sí cuenta el intento aunque la respuesta sea un error.
   */
  async verifyChallenge<T>(challengeId: string, code: string, channel: ChannelVerification<T>): Promise<T> {
    const attempt = await withTransaction<Attempt<T>>(this.pool, (c) => this.verifyInTransaction(c, challengeId, code, channel));
    if (!attempt.ok) throw attempt.error;
    return attempt.value;
  }

  private async verifyInTransaction<T>(c: PoolClient, challengeId: string, code: string, channel: ChannelVerification<T>): Promise<Attempt<T>> {
    // El bloqueo de la fila serializa las peticiones simultáneas con el mismo reto: solo una lo consume (ADR 0006, decisión 5).
    const { rows } = await c.query<{
      cedula_fingerprint: string;
      code_hash: string | null;
      attempts_used: number;
      consumed_at: Date | null;
      superseded_at: Date | null;
      expired: boolean;
    }>(
      `SELECT cedula_fingerprint, code_hash, attempts_used, consumed_at, superseded_at, (expires_at <= app.clock_now()) AS expired
       FROM app.otp_challenges WHERE id = $1 AND purpose = 'verify' FOR UPDATE`,
      [challengeId],
    );
    const challenge = rows[0];
    // Reto inexistente: la misma respuesta que un código incorrecto, para no distinguir retos (criterio 4.8).
    if (!challenge) return { ok: false, error: wrongCode(MAX_ATTEMPTS - 1) };
    if (challenge.consumed_at || challenge.superseded_at) {
      return { ok: false, error: codeGone('code_superseded', 'El código ya no es válido') };
    }
    if (challenge.expired) return { ok: false, error: codeGone('code_expired', 'El código venció') };
    if (challenge.attempts_used >= MAX_ATTEMPTS) {
      return { ok: false, error: codeGone('code_attempts_exhausted', 'Se agotaron los intentos') };
    }

    const affiliate = await this.findAffiliate(c, challenge.cedula_fingerprint);
    const matches = !!challenge.code_hash && !!affiliate && sameHash(challenge.code_hash, hashOtpCode(challengeId, code));
    if (!matches) {
      const upd = await c.query<{ attempts_used: number }>(
        'UPDATE app.otp_challenges SET attempts_used = attempts_used + 1 WHERE id = $1 RETURNING attempts_used',
        [challengeId],
      );
      return { ok: false, error: wrongCode(MAX_ATTEMPTS - upd.rows[0].attempts_used) };
    }

    await c.query('UPDATE app.otp_challenges SET consumed_at = app.clock_now() WHERE id = $1', [challengeId]);
    const patient = await c.query<{ id: string }>(
      `INSERT INTO app.patient_refs (cedula_fingerprint, sim_affiliate_id) VALUES ($1, $2)
       ON CONFLICT (cedula_fingerprint) DO UPDATE SET cedula_fingerprint = EXCLUDED.cedula_fingerprint
       RETURNING id`,
      [challenge.cedula_fingerprint, affiliate!.id],
    );
    const patientRefId = patient.rows[0].id;
    await c.query(
      `INSERT INTO app.consent_records (kind, cedula_fingerprint, declarant, channel, notice_version, accepted_at, recorded_at)
       VALUES ('data_processing', $1, $2, $3, $4, $5::timestamptz, app.clock_now())`,
      [challenge.cedula_fingerprint, channel.consent.declarant, channel.consent.channel, channel.consent.noticeVersion, channel.consent.acceptedAt],
    );
    const value = await channel.link(c, { patientRefId, fingerprint: challenge.cedula_fingerprint, fullName: affiliate!.full_name });
    return { ok: true, value };
  }

  /**
   * La huella no se puede invertir: se busca al afiliado recalculando la huella de cada cédula de `sim`.
   * La EPS simulada es pequeña (ADR 0013); si crece, conviene guardar el afiliado en el reto.
   */
  private async findAffiliate(c: PoolClient, fingerprint: string) {
    const { rows } = await c.query<{ id: string; cedula: string; full_name: string }>('SELECT id, cedula, full_name FROM sim.affiliates');
    return rows.find((a) => cedulaFingerprint(a.cedula) === fingerprint);
  }

  /** Reutiliza el navegador de la cookie si existe; si no, crea uno con un token nuevo. Siempre renueva el token CSRF. */
  private async resolveDevice(c: PoolClient, deviceToken: string | null) {
    const csrfToken = newToken();
    if (deviceToken) {
      const found = await c.query<{ id: string }>('SELECT id FROM app.browser_devices WHERE token_hash = $1', [hashToken(deviceToken)]);
      if (found.rows[0]) {
        await c.query('UPDATE app.browser_devices SET csrf_hash = $2, last_seen_at = app.clock_now() WHERE id = $1', [
          found.rows[0].id,
          hashToken(csrfToken),
        ]);
        return { deviceId: found.rows[0].id, token: deviceToken, csrfToken };
      }
    }
    const token = newToken();
    const created = await c.query<{ id: string }>(
      'INSERT INTO app.browser_devices (token_hash, csrf_hash) VALUES ($1, $2) RETURNING id',
      [hashToken(token), hashToken(csrfToken)],
    );
    return { deviceId: created.rows[0].id, token, csrfToken };
  }

  /** Reutiliza la vinculación vigente del mismo dueño y paciente; si venció, la revoca y crea otra (3 meses). */
  async resolveBinding(c: PoolClient, owner: BindingOwner, patientRefId: string): Promise<Date> {
    const column = owner.column; // unión cerrada de dos nombres: no viene del usuario
    const existing = await c.query<{ id: string; expires_at: Date; live: boolean }>(
      `SELECT id, expires_at, (expires_at > app.clock_now()) AS live FROM app.channel_bindings
       WHERE ${column} = $1 AND patient_ref_id = $2 AND revoked_at IS NULL FOR UPDATE`,
      [owner.id, patientRefId],
    );
    const current = existing.rows[0];
    if (current?.live) return current.expires_at;
    if (current) await c.query('UPDATE app.channel_bindings SET revoked_at = app.clock_now() WHERE id = $1', [current.id]);
    const created = await c.query<{ expires_at: Date }>(
      `WITH t AS (SELECT app.clock_now() AS now)
       INSERT INTO app.channel_bindings (patient_ref_id, ${column}, created_at, expires_at)
       SELECT $1, $2, t.now, t.now + interval '3 months' FROM t
       RETURNING expires_at`,
      [patientRefId, owner.id],
    );
    return created.rows[0].expires_at;
  }
}
