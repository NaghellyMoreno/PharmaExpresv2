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
