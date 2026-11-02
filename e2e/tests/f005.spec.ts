import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

// F005 (contracts/F005.md): vencimiento, bloqueo, caminos de salida, orientación y límites de pedido en P-02.
// Contra la web y la API reales, en modo capture. Datos ficticios. El reloj se mueve con el comando test:clock (ADR 0021).
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';
const AFFILIATES = fileURLToPath(new URL('../../data/simulated/affiliates.json', import.meta.url));
const OTP_REQUESTS = '**/api/v1/identity/otp-requests';
const VERIFICATIONS = '**/api/v1/identity/verifications';
const ORIGIN = 'http://localhost:4173';

// Cadenas del anexo de T.1, escritas aquí a propósito.
const S = {
  authorized: 'Actúo con su autorización',
  accept: 'Aceptar',
  cedula: 'Cédula',
  next: 'Continuar',
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
  verified: 'Identidad verificada',
  incorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
  used: 'Este código ya se usó. Pida un código nuevo.',
  expired: 'El código venció. Elija una opción para continuar.',
  exhausted: 'Se agotaron los intentos. Elija una opción para continuar.',
  newCode: 'Pedir un código nuevo',
  eps: 'Actualizar mis datos en la EPS',
  inPerson: 'Acudir a la atención presencial',
  epsGuidance:
    'El celular y el correo se cambian en su EPS (Salud Total o Sanitas), no en Pharma Express. Comuníquese con su EPS para actualizar sus datos y luego pida un código nuevo.',
  inPersonGuidance: 'Puede acudir a la atención presencial en un punto de Disfarma en Manizales.',
  tooSoon: 'Ya enviamos un código hace poco. Espere 2 minutos para pedir uno nuevo.',
  hourly: 'Alcanzó el límite de códigos por hora. Intente más tarde o acuda a la atención presencial.',
  approved:
    'Si la cédula está afiliada a Salud Total o Sanitas, enviamos un código al celular registrado en tu EPS y al correo, si lo tiene. Si no te llega en 2 minutos, puedes pedir un código nuevo, actualizar tus datos en tu EPS o acudir a la atención presencial.',
};
const AFFILIATED = '1000000001';

let pool: Pool;
const clock = (...args: string[]) =>
  execFileSync('pnpm', ['--filter', 'api', 'test:clock', ...args], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
const clean = () => pool.query('TRUNCATE app.channel_bindings, app.browser_devices, app.patient_refs, app.consent_records, app.otp_challenges, app.captured_messages');

test.beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  execFileSync('pnpm', ['--filter', 'api', 'db:seed', '--', '--file', AFFILIATES], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
});
test.afterAll(async () => {
  clock('reset');
  await pool.end();
});
test.beforeEach(async () => {
  clock('reset');
  await clean();
});
// T.7: se restablece el reloj y se borran los retos creados.
test.afterEach(async () => {
  clock('reset');
  await clean();
});

async function openP02(page: Page) {
  await page.goto('/');
  await page.getByLabel(S.authorized, { exact: true }).check();
  await page.getByRole('button', { name: S.accept, exact: true }).click();
  await expect(page.getByLabel(S.cedula, { exact: true })).toBeVisible();
}
async function sendCedula(page: Page, cedula = AFFILIATED) {
  await page.getByLabel(S.cedula, { exact: true }).fill(cedula);
  const [res] = await Promise.all([page.waitForResponse(OTP_REQUESTS), page.getByRole('button', { name: S.next, exact: true }).click()]);
  return res;
}
/** Pide el código desde P-02 y devuelve el código del SMS capturado (se borran los mensajes antes para leer el de este pedido). */
async function requestOnPage(page: Page) {
  await pool.query('TRUNCATE app.captured_messages');
  const res = await sendCedula(page);
  expect(res.status()).toBe(202);
  return { challengeId: ((await res.json()) as { challengeId: string }).challengeId, code: await smsCode() };
}
async function smsCode(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { rows } = await pool.query<{ body: string }>("SELECT body FROM app.captured_messages WHERE channel = 'sms' ORDER BY created_at DESC LIMIT 1");
    if (rows[0]) return rows[0].body.match(/\b\d{6}\b/)![0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('No llegó el SMS capturado');
}
const wrongOf = (code: string, n = 1) => String((Number(code) + n) % 1_000_000).padStart(6, '0');
async function verifyWith(page: Page, code: string) {
  await page.getByLabel(S.codeLabel, { exact: true }).fill(code);
  const [res] = await Promise.all([page.waitForResponse(VERIFICATIONS), page.getByRole('button', { name: S.verify, exact: true }).click()]);
  return res;
}
/** Envía un código desde fuera de la pantalla, con la misma cookie del contexto y un Origin válido. */
const verifyOutside = (context: BrowserContext, challengeId: string, code: string) =>
  context.request.post('/api/v1/identity/verifications', { data: { challengeId, code }, headers: { Origin: ORIGIN } });

async function expectThreePaths(page: Page) {
  for (const name of [S.newCode, S.eps, S.inPerson]) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByLabel(S.codeLabel)).toHaveCount(0);
  await expect(page.getByRole('button', { name: S.verify, exact: true })).toHaveCount(0);
  await expect(page.getByText(S.verified)).toHaveCount(0);
}
async function noSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}
/** "Pedir un código nuevo": cédula vacía con el foco y, cumplida la espera, el mensaje aprobado y el campo del código. */
async function askAgain(page: Page) {
  await page.getByRole('button', { name: S.newCode, exact: true }).click();
  const field = page.getByLabel(S.cedula, { exact: true });
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  const res = await sendCedula(page);
  expect(res.status()).toBe(202);
  await expect(page.getByRole('status')).toHaveText(S.approved);
  await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();
}

test.describe('pasos 1 y 3: código vencido', () => {
  test('1.5, 3.3, 3.4, 3.5 y 3.6: vencido muestra el mensaje y los tres caminos, con teclado y sin violaciones de axe', async ({ page }) => {
    await openP02(page);
    const { code } = await requestOnPage(page);
    clock('set', '601');
    let verifications = 0;
    page.on('request', (r) => r.url().endsWith('/identity/verifications') && verifications++);
    const res = await verifyWith(page, code);
    expect(res.status()).toBe(410);
    await expect(page.getByRole('alert')).toHaveText(S.expired);
    await expectThreePaths(page);
    expect(verifications).toBe(1);
    await noSeriousViolations(page);

    // 3.3 y 3.5: con teclado y sin peticiones al elegir los caminos de la EPS y de la atención presencial.
    let requests = 0;
    page.on('request', () => requests++);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.newCode, exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.eps, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(S.epsGuidance, { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.inPerson, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(S.inPersonGuidance, { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(requests).toBe(0);

    // 3.4: el reloj ya está en 601, así que el nuevo pedido cumple la espera de 2 minutos.
    await askAgain(page);
  });
});

test.describe('paso 2: bloqueo por intentos', () => {
  test('2.7 y 3.4: dos errores dejan el campo; el tercero muestra los tres caminos', async ({ page }) => {
    await openP02(page);
    const { code } = await requestOnPage(page);
    for (const n of [1, 2]) {
      expect((await verifyWith(page, wrongOf(code, n))).status()).toBe(422);
      await expect(page.getByRole('alert')).toHaveText(S.incorrect);
      await expect(page.getByRole('button', { name: S.newCode, exact: true })).toHaveCount(0);
      await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();
    }
    expect((await verifyWith(page, wrongOf(code, 3))).status()).toBe(422);
    await expect(page.getByRole('alert')).toHaveText(S.exhausted);
    await expectThreePaths(page);
    clock('set', '120');
    await askAgain(page);
  });

  test('2.9, 3.3, 3.6: con los tres errores enviados fuera de la pantalla, el código correcto responde 410 y muestra los caminos', async ({ page, context }) => {
    await openP02(page);
    await pool.query('TRUNCATE app.captured_messages');
    const request = await sendCedula(page);
    const { challengeId } = (await request.json()) as { challengeId: string };
    const code = await smsCode();
    for (const remaining of [2, 1, 0]) {
      const res = await verifyOutside(context, challengeId, wrongOf(code, 3 - remaining));
      expect(res.status()).toBe(422);
      expect((await res.json()).attemptsRemaining).toBe(remaining);
    }
    // La pantalla no se enteró: sigue mostrando el campo del código.
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();
    const res = await verifyWith(page, code);
    expect(res.status()).toBe(410);
    expect((await res.json()).code).toBe('code_attempts_exhausted');
    await expect(page.getByRole('alert')).toHaveText(S.exhausted);
    await expectThreePaths(page);
    await noSeriousViolations(page);
    clock('set', '120');
    await askAgain(page);
  });
});

/** Busca controles interactivos cuyo nombre accesible, name, id o placeholder coincida con la expresión; no mira párrafos. */
async function scanControls(page: Page) {
  return page.evaluate(() => {
    const re = /celular|tel[eé]fono|correo|e-?mail|phone/i;
    const controls = [...document.querySelectorAll('input, textarea, select, button, a, form, [role=button], [role=link], [role=textbox], [role=combobox]')];
    const names = (el: Element) => {
      const labelled = (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '');
      const labels = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? [...(el.labels ?? [])].map((l) => l.textContent ?? '') : [];
      return [el.getAttribute('aria-label'), ...labelled, ...labels, el.textContent, el.getAttribute('name'), el.id, el.getAttribute('placeholder')].filter(Boolean) as string[];
    };
    return { checked: controls.length, matches: controls.filter((el) => names(el).some((n) => re.test(n))).map((el) => el.outerHTML.slice(0, 80)) };
  });
}

test.describe('paso 4: la orientación no ofrece cambiar el celular ni el correo', () => {
  test('4.1 a 4.3: texto de orientación, sin formulario ni campos, sin peticiones ni cambios', async ({ page }) => {
    await openP02(page);
    // Control positivo: la misma búsqueda, en la pantalla de cédula, revisa al menos 2 controles y no encuentra nada...
    const control = await scanControls(page);
    expect(control.checked).toBeGreaterThanOrEqual(2);
    expect(control.matches).toEqual([]);
    // ...y sí encuentra un botón sintético inyectado.
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.textContent = 'Cambiar mi celular';
      b.id = 'sintetico';
      document.body.append(b);
    });
    expect((await scanControls(page)).matches).toHaveLength(1);
    await page.evaluate(() => document.getElementById('sintetico')?.remove());

    const { code } = await requestOnPage(page);
    clock('set', '601');
    expect((await verifyWith(page, code)).status()).toBe(410);
    await expectThreePaths(page);

    const mapBefore = await rowCounts();
    let requests = 0;
    page.on('request', () => requests++);
    await page.getByRole('button', { name: S.eps, exact: true }).click();
    await expect(page.getByText(S.epsGuidance, { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(requests).toBe(0);

    // 4.2: ni <form> ni campos; ningún control con nombre de celular o correo (los botones, incluido el de la EPS, no coinciden).
    await expect(page.locator('form, input, textarea, select')).toHaveCount(0);
    const scan = await scanControls(page);
    expect(scan.checked).toBeGreaterThanOrEqual(3);
    expect(scan.matches).toEqual([]);

    // 4.3: nada cambió en la base ni en la URL o el almacenamiento del navegador.
    expect(await rowCounts()).toEqual(mapBefore);
    const stored = await page.evaluate(() => JSON.stringify([location.href, { ...localStorage }, { ...sessionStorage }]));
    expect(stored).not.toContain(AFFILIATED);
    expect(stored).not.toMatch(/\d{6,}|@/); // ni cédula, ni celular, ni correo
  });
});

async function rowCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema IN ('public', 'app', 'sim') AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%drizzle%migrations%' AND table_name <> 'test_clock' ORDER BY 1, 2`,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[`${r.table_schema}.${r.table_name}`] = Number((await pool.query(`SELECT count(*) AS n FROM "${r.table_schema}"."${r.table_name}"`)).rows[0].n);
  return map;
}

test.describe('pasos 5 a 7: límites del pedido y código anulado', () => {
  test('5.8: un segundo pedido antes de 2 minutos desde otra página del mismo contexto muestra la espera', async ({ context, page }) => {
    await openP02(page);
    const first = await requestOnPage(page);
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toBeVisible();

    const second = await context.newPage();
    await openP02(second);
    const res = await sendCedula(second);
    expect(res.status()).toBe(429);
    expect((await res.json()).code).toBe('code_too_soon');
    await expect(second.getByRole('alert')).toHaveText(S.tooSoon);
    await expect(second.getByLabel(S.cedula, { exact: true })).toBeFocused();
    await expect(second.getByLabel(S.codeLabel)).toHaveCount(0);
    await expect(second.getByText(S.approved, { exact: true })).toHaveCount(0);
    await noSeriousViolations(second);

    // En la página 1 el código sigue sirviendo.
    expect((await verifyWith(page, first.code)).status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText(S.verified);
  });

  test('6.6: el código de la página 1 queda anulado por el de la página 2', async ({ context, page }) => {
    await openP02(page);
    const a = await requestOnPage(page);
    clock('set', '120');
    const second = await context.newPage();
    await openP02(second);
    const b = await requestOnPage(second);
    expect(b.challengeId).not.toBe(a.challengeId);

    const old = await verifyWith(page, a.code);
    expect(old.status()).toBe(410);
    expect((await old.json()).code).toBe('code_superseded');
    await expect(page.getByRole('alert')).toHaveText(S.used);
    await expect(page.getByRole('button', { name: S.newCode, exact: true })).toHaveCount(0);
    await expect(page.getByText(S.verified)).toHaveCount(0);

    expect((await verifyWith(second, b.code)).status()).toBe(200);
    await expect(second.getByRole('status')).toHaveText(S.verified);
  });

  test('7.10: cinco pedidos por la API y el sexto desde la pantalla muestran el límite por hora', async ({ context, page }) => {
    await openP02(page);
    for (const seconds of [0, 120, 240, 360, 480]) {
      clock('set', String(seconds));
      const res = await context.request.post('/api/v1/identity/otp-requests', { data: { cedula: AFFILIATED }, headers: { Origin: ORIGIN } });
      expect(res.status(), `a ${seconds} s`).toBe(202);
    }
    clock('set', '600');
    const res = await sendCedula(page);
    expect(res.status()).toBe(429);
    expect((await res.json()).code).toBe('code_hourly_limit');
    await expect(page.getByRole('alert')).toHaveText(S.hourly);
    await expect(page.getByLabel(S.cedula, { exact: true })).toBeFocused();
    await expect(page.getByLabel(S.codeLabel)).toHaveCount(0);
  });
});
