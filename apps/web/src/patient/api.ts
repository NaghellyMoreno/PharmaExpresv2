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
export type VerifyOutcome = 'verified' | 'incorrect' | 'used' | 'error';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** POST /identity/otp-requests: solo el 202 es éxito; cualquier otra respuesta o fallo de red lanza un error. */
export async function requestVerificationCode(cedula: string): Promise<CodeRequestAccepted> {
  const res = await fetch(`${BASE}/identity/otp-requests`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ cedula } satisfies components['schemas']['CedulaInput']),
  });
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
    if (res.status === 200) return 'verified';
    const problem = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status === 422 && problem.code === 'code_incorrect') return 'incorrect';
    if (res.status === 410 && problem.code === 'code_superseded') return 'used';
    return 'error';
  } catch {
    return 'error';
  }
}
