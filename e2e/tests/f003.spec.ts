import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

// F003 (contracts/F003.md): P-02 contra la web y la API reales, en modo capture. Datos ficticios.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';
const AFFILIATES = fileURLToPath(new URL('../../data/simulated/affiliates.json', import.meta.url));
const OTP_REQUESTS = '**/api/v1/identity/otp-requests';
const VERIFICATIONS = '**/api/v1/identity/verifications';

// Cadenas del anexo de T.1, escritas aquí a propósito.
const S = {
  authorized: 'Actúo con su autorización',
  holder: 'Soy el titular',
  accept: 'Aceptar',
  cedula: 'Cédula',
  next: 'Continuar',
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
  verified: 'Identidad verificada',
  incorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
  used: 'Este código ya se usó. Pida un código nuevo.',
  requestError: 'No pudimos enviar el código. Intente de nuevo.',
  cedulaInvalid: 'Cédula inválida. Escriba entre 5 y 12 dígitos.',
  incomplete: 'Código incompleto. Escriba los 6 dígitos.',
  another: 'Verificar otro código',
  approved:
    'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.',
};
const AFFILIATED = '1000000001';
const UNKNOWN = '1000000999';
const fingerprintOf = (cedula: string) => createHmac('sha256', process.env.CEDULA_FINGERPRINT_KEY!).update(cedula).digest('hex');

let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  // Carga repetible de los afiliados ficticios (ADR 0013), siempre desde el archivo versionado.
  execFileSync('pnpm', ['--filter', 'api', 'db:seed', '--', '--file', AFFILIATES], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
});
test.afterAll(async () => {
  await pool.end();
});
test.beforeEach(async () => {
  await pool.query('TRUNCATE app.channel_bindings, app.browser_devices, app.patient_refs, app.consent_records, app.otp_challenges, app.captured_messages');
});

/** Filas por tabla de los esquemas app y public (la lista se obtiene al momento; el reloj queda fuera). */
async function rowMap(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema IN ('app', 'public') AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%drizzle%migrations%' AND table_name <> 'test_clock'
     ORDER BY 1, 2`,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[`${r.table_schema}.${r.table_name}`] = Number((await pool.query(`SELECT count(*) AS n FROM "${r.table_schema}"."${r.table_name}"`)).rows[0].n);
  return map;
}

/** P-01 hasta P-02. Con `withoutCookie`, la aceptación se simula sin cookie (navegador que nunca aceptó). */
async function openP02(page: Page, option = S.authorized, withoutCookie = false) {
  if (withoutCookie) await page.route('**/api/v1/consents/acceptance', (r) => r.fulfill({ status: 204 }));
  await page.goto('/');
  await page.getByLabel(option, { exact: true }).check();
  await page.getByRole('button', { name: S.accept, exact: true }).click();
  await expect(page.getByLabel(S.cedula, { exact: true })).toBeVisible();
}

async function consentPayload(context: BrowserContext) {
  const cookie = (await context.cookies()).find((c) => c.name === '__Host-pe_consent')!;
  return JSON.parse(Buffer.from(decodeURIComponent(cookie.value).split('.')[0], 'base64url').toString('utf8')) as {
    noticeVersion: string;
    declarant: string;
    acceptedAt: string;
  };
}

async function sendCedula(page: Page, cedula: string) {
  await page.getByLabel(S.cedula, { exact: true }).fill(cedula);
  const [res] = await Promise.all([page.waitForResponse(OTP_REQUESTS), page.getByRole('button', { name: S.next, exact: true }).click()]);
  return res;
}

/** Lee el código del SMS capturado (con sondeo: el envío ocurre después de responder). */
async function smsCode(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { rows } = await pool.query<{ body: string }>("SELECT body FROM app.captured_messages WHERE channel = 'sms' ORDER BY created_at DESC LIMIT 1");
    if (rows[0]) return rows[0].body.match(/\b\d{6}\b/)![0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('No llegó el SMS capturado');
}

async function verifyWith(page: Page, code: string) {
  await page.getByLabel(S.codeLabel, { exact: true }).fill(code);
  const [res] = await Promise.all([page.waitForResponse(VERIFICATIONS), page.getByRole('button', { name: S.verify, exact: true }).click()]);
  return res;
}

async function noSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

test.describe('pasos 1, 4, 5 y 7: recorrido completo', () => {
  test('1.1, 4.1, 5.1 y 7.1: aceptar como tercero, pedir el código, verificar y revisar el registro de la aceptación', async ({ page, context }) => {
    await openP02(page, S.authorized);
    const payload = await consentPayload(context);
    expect(payload.declarant).toBe('third_party');
    const res = await sendCedula(page, AFFILIATED);
    expect(res.status()).toBe(202);
    // 7.1: el mensaje visible es exactamente el aprobado, en un role=status.
    await expect(page.getByRole('status')).toHaveText(S.approved);
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();

    let verifications = 0;
    page.on('request', (r) => r.url().endsWith('/identity/verifications') && verifications++);
    const verification = await verifyWith(page, await smsCode());
    expect(verification.status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText(S.verified);
    expect(verifications).toBe(1);
    expect((await context.cookies()).map((c) => c.name)).toContain('__Host-pe_device');

    const { rows } = await pool.query('SELECT * FROM app.consent_records');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'data_processing',
      declarant: 'third_party',
      channel: 'web',
      notice_version: payload.noticeVersion,
      cedula_fingerprint: fingerprintOf(AFFILIATED),
    });
    // La hora de la aceptación (cookie) no es la de la verificación.
    expect(rows[0].accepted_at.toISOString()).toBe(payload.acceptedAt);
    expect(rows[0].recorded_at.getTime()).toBeGreaterThan(rows[0].accepted_at.getTime());
  });

  test('1.7 (Inferido): sin cookie de consentimiento la API responde 401, la pantalla muestra el error y no se crea nada', async ({ page }) => {
    await openP02(page, S.holder, true);
    const before = await rowMap();
    const res = await sendCedula(page, AFFILIATED);
    expect(res.status()).toBe(401);
    await expect(page.getByRole('alert')).toHaveText(S.requestError);
    await expect(page.getByText(S.approved, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(S.codeLabel)).toHaveCount(0);
    await new Promise((r) => setTimeout(r, 500));
    expect(await rowMap()).toEqual(before);
  });

  for (const cedula of ['', 'abc', '1234', '1234567890123']) {
    test(`1.8 (Inferido): la cédula "${cedula}" no envía petición, muestra el error y conserva el foco`, async ({ page }) => {
      await openP02(page);
      let sent = false;
      page.on('request', (r) => r.url().includes('/identity/otp-requests') && (sent = true));
      const field = page.getByLabel(S.cedula, { exact: true });
      await field.fill(cedula);
      await page.getByRole('button', { name: S.next, exact: true }).click();
      await page.waitForTimeout(1000);
      expect(sent).toBe(false);
      await expect(page.getByRole('alert')).toHaveText(S.cedulaInvalid);
      await expect(field).toBeFocused();
    });
  }

  test('8.1: una cédula que no existe muestra exactamente el mismo mensaje y el campo del código', async ({ page }) => {
    await openP02(page);
    const res = await sendCedula(page, UNKNOWN);
    expect(res.status()).toBe(202);
    await expect(page.getByRole('status')).toHaveText(S.approved);
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM app.captured_messages');
    expect(rows[0].n).toBe(0);
  });

  test('4.6: un código incorrecto muestra el mensaje y el campo conserva el foco', async ({ page }) => {
    await openP02(page);
    await sendCedula(page, AFFILIATED);
    const real = await smsCode();
    const wrong = String((Number(real) + 1) % 1_000_000).padStart(6, '0');
    const res = await verifyWith(page, wrong);
    expect(res.status()).toBe(422);
    await expect(page.getByRole('alert')).toHaveText(S.incorrect);
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeFocused();
    await expect(page.getByText(S.verified)).toHaveCount(0);
  });

  for (const value of ['', '12345']) {
    test(`4.10 (Inferido): el código "${value}" no envía petición, muestra el error y conserva el foco`, async ({ page }) => {
      await openP02(page);
      await sendCedula(page, AFFILIATED);
      let sent = false;
      page.on('request', (r) => r.url().includes('/identity/verifications') && (sent = true));
      const field = page.getByLabel(S.codeLabel, { exact: true });
      await field.fill(value);
      await page.getByRole('button', { name: S.verify, exact: true }).click();
      await page.waitForTimeout(1000);
      expect(sent).toBe(false);
      await expect(page.getByRole('alert')).toHaveText(S.incomplete);
      await expect(field).toBeFocused();
    });
  }

  test('6.2: enviar de nuevo el mismo código muestra "Código ya usado" y no "Identidad verificada"', async ({ page }) => {
    await openP02(page);
    await sendCedula(page, AFFILIATED);
    const code = await smsCode();
    expect((await verifyWith(page, code)).status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText(S.verified);
    await page.getByRole('button', { name: S.another, exact: true }).click();
    const again = await verifyWith(page, code);
    expect(again.status()).toBe(410);
    expect((await again.json()).code).toBe('code_superseded');
    await expect(page.getByRole('alert')).toHaveText(S.used);
    await expect(page.getByText(S.verified)).toHaveCount(0);
  });
});

test.describe('7.3: el mensaje solo aparece tras el 202', () => {
  test('durante la petición el botón está deshabilitado y no hay mensaje; con 500 o corte de red solo el error', async ({ page }) => {
    await openP02(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(OTP_REQUESTS, async (route) => {
      await gate;
      await route.continue();
    });
    await page.getByLabel(S.cedula, { exact: true }).fill(AFFILIATED);
    const done = page.waitForResponse(OTP_REQUESTS);
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.getByRole('button', { name: S.next, exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toHaveCount(0);
    release();
    await done;
    await expect(page.getByRole('status')).toHaveText(S.approved);
    await page.unroute(OTP_REQUESTS);
  });

  for (const [name, handler] of [
    ['500', (r: import('@playwright/test').Route) => r.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' })],
    ['corte de red', (r: import('@playwright/test').Route) => r.abort()],
  ] as const) {
    test(`con ${name} se muestra el error y no el mensaje aprobado`, async ({ page }) => {
      await openP02(page);
      await page.route(OTP_REQUESTS, handler);
      await page.getByLabel(S.cedula, { exact: true }).fill(AFFILIATED);
      await page.getByRole('button', { name: S.next, exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText(S.requestError);
      await expect(page.getByText(S.approved, { exact: true })).toHaveCount(0);
      await expect(page.getByLabel(S.codeLabel)).toHaveCount(0);
    });
  }
});

test.describe('7.4: accesibilidad de P-02', () => {
  test('sin violaciones de axe en los tres estados y recorrido solo con teclado', async ({ page }) => {
    await openP02(page);
    // Estado 1: cédula, con etiqueta visible.
    await expect(page.getByText(S.cedula, { exact: true })).toBeVisible();
    await noSeriousViolations(page);
    // Con teclado: el campo recibe el foco, Enter envía el formulario.
    await page.getByLabel(S.cedula, { exact: true }).focus();
    await page.keyboard.type(AFFILIATED);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.next, exact: true })).toBeFocused();
    const [res] = await Promise.all([page.waitForResponse(OTP_REQUESTS), page.keyboard.press('Enter')]);
    expect(res.status()).toBe(202);
    // Estado 2: código (el foco pasa al campo).
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeFocused();
    await expect(page.getByText(S.codeLabel, { exact: true })).toBeVisible();
    await noSeriousViolations(page);
    await page.keyboard.type(await smsCode());
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.verify, exact: true })).toBeFocused();
    const [ver] = await Promise.all([page.waitForResponse(VERIFICATIONS), page.keyboard.press('Enter')]);
    expect(ver.status()).toBe(200);
    // Estado 3: verificada.
    await expect(page.getByRole('status')).toHaveText(S.verified);
    await noSeriousViolations(page);
  });
});
