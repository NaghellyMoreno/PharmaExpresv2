import type { components } from '@pharma/api-contract';

export type PrivacyNotice = components['schemas']['PrivacyNotice'];
export type Declarant = components['schemas']['Declarant'];

const BASE = '/api/v1';

/** GET /privacy-notice: lanza un error si la API no responde bien. */
export async function fetchPrivacyNotice(): Promise<PrivacyNotice> {
  const res = await fetch(`${BASE}/privacy-notice`);
  if (!res.ok) throw new Error('privacy-notice');
  return (await res.json()) as PrivacyNotice;
}

/** POST /consents/acceptance: la API responde 204 y emite la cookie HttpOnly; no se lee desde JavaScript. */
export async function acceptPrivacyNotice(noticeVersion: string, declarant: Declarant): Promise<void> {
  const res = await fetch(`${BASE}/consents/acceptance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noticeVersion, declarant } satisfies components['schemas']['ConsentAcceptanceInput']),
  });
  if (res.status !== 204) throw new Error('consents-acceptance');
}

export type CodeRequestAccepted = components['schemas']['OtpRequestAccepted'];
export type NextStep = components['schemas']['NextStep'];
type Problem = components['schemas']['Problem'];

/** Resultado de verificar: vencido y agotado traen los caminos de salida que manda la API. */
export type VerifyOutcome =
  | { kind: 'verified' | 'incorrect' | 'used' | 'error' }
  | { kind: 'exhausted_now' }
  | { kind: 'expired' | 'exhausted'; nextSteps: NextStep[] };

/** El pedido del código rechazado por la espera de 2 minutos (`too_soon`) o por el máximo por hora (`hourly_limit`). */
export class CodeRequestRejected extends Error {
  constructor(readonly reason: 'too_soon' | 'hourly_limit') {
    super(reason);
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** POST /identity/otp-requests: solo el 202 es éxito; el 429 de límite se distingue, lo demás lanza un error. */
export async function requestVerificationCode(cedula: string): Promise<CodeRequestAccepted> {
  const res = await fetch(`${BASE}/identity/otp-requests`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ cedula } satisfies components['schemas']['CedulaInput']),
  });
  if (res.status === 429) {
    const problem = (await res.json().catch(() => ({}))) as Partial<Problem>;
    if (problem.code === 'code_too_soon') throw new CodeRequestRejected('too_soon');
    if (problem.code === 'code_hourly_limit') throw new CodeRequestRejected('hourly_limit');
  }
  if (res.status !== 202) throw new Error('otp-requests');
  return (await res.json()) as CodeRequestAccepted;
}

/** POST /identity/verifications: traduce la respuesta a un resultado que la pantalla sabe mostrar. */
export async function verifyIdentity(challengeId: string, code: string): Promise<VerifyOutcome> {
  try {
    const res = await fetch(`${BASE}/identity/verifications`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ challengeId, code } satisfies components['schemas']['OtpVerificationInput']),
    });
    if (res.status === 200) return { kind: 'verified' };
    const problem = (await res.json().catch(() => ({}))) as Partial<Problem>;
    // El tercer error ya agota los intentos: no hace falta esperar a un cuarto envío que no podría servir.
    if (res.status === 422 && problem.code === 'code_incorrect') return problem.attemptsRemaining === 0 ? { kind: 'exhausted_now' } : { kind: 'incorrect' };
    if (res.status === 410 && problem.code === 'code_superseded') return { kind: 'used' };
    if (res.status === 410 && (problem.code === 'code_expired' || problem.code === 'code_attempts_exhausted')) {
      return { kind: problem.code === 'code_expired' ? 'expired' : 'exhausted', nextSteps: problem.nextSteps ?? [] };
    }
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
