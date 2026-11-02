import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

// F009 (contracts/F009.md): el navegador queda vinculado y la vinculación vence a los 3 meses.
// Web y API reales en modo capture. El reloj (app.test_clock) es global: este archivo corre en serie. Datos ficticios.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';
const AFFILIATES = fileURLToPath(new URL('../../data/simulated/affiliates.json', import.meta.url));
const NAME = 'Paciente Ficticio Uno';
const CEDULA = '1000000001';
const ME = '**/api/v1/me';

// Textos provisionales de P-03 (Inferido hasta que la usuaria los confirme) y del aviso, escritos aquí a propósito.
const S = {
  p03Title: 'Paciente vinculado',
  loading: 'Cargando…',
  retry: 'Reintentar',
  revoke: 'Revocar mi autorización',
  holder: 'Soy el titular',
  authorized: 'Actúo con su autorización',
  accept: 'Aceptar',
  reject: 'No acepto',
  cedula: 'Cédula',
  next: 'Continuar',
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
};

let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  execFileSync('pnpm', ['--filter', 'api', 'db:seed', '--', '--file', AFFILIATES], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
});
test.afterAll(async () => {
  await pool.end();
});
const clock = (...args: string[]) => execFileSync('pnpm', ['--filter', 'api', 'test:clock', ...args], { env: { ...process.env, DATABASE_URL }, stdio: 'pipe' });
test.beforeEach(async () => {
  clock('reset');
  await pool.query('TRUNCATE app.channel_bindings, app.browser_devices, app.patient_refs, app.consent_records, app.otp_challenges, app.captured_messages');
});
// El desfase es global: cada prueba lo devuelve a cero aunque falle.
test.afterEach(() => {
  clock('reset');
});

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

async function smsCode(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { rows } = await pool.query<{ body: string }>("SELECT body FROM app.captured_messages WHERE channel = 'sms' ORDER BY created_at DESC LIMIT 1");
    if (rows[0]) return rows[0].body.match(/\b\d{6}\b/)![0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('No llegó el SMS capturado');
}

/** Aviso, cédula, código y verificación en `page`. Devuelve las respuestas de la solicitud del código y de la verificación. */
async function verifyInBrowser(page: Page) {
  await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
  await page.goto('/');
  await page.getByLabel(S.authorized, { exact: true }).check();
  await page.getByRole('button', { name: S.accept, exact: true }).click();
  await page.getByLabel(S.cedula, { exact: true }).fill(CEDULA);
  const [otp] = await Promise.all([page.waitForResponse('**/api/v1/identity/otp-requests'), page.getByRole('button', { name: S.next, exact: true }).click()]);
  await page.getByLabel(S.codeLabel, { exact: true }).fill(await smsCode());
  const [verification] = await Promise.all([page.waitForResponse('**/api/v1/identity/verifications'), page.getByRole('button', { name: S.verify, exact: true }).click()]);
  expect(verification.status()).toBe(200);
  return { otp: await otp.json(), verification: await verification.json() };
}

const longDate = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(new Date(iso));

/** "Cerrar el navegador": solo sobreviven las cookies persistentes (las de sesión se pierden). */
async function reopen(browser: Browser, previous: BrowserContext): Promise<BrowserContext> {
  const persistent = (await previous.cookies()).filter((c) => c.expires !== -1);
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', baseURL: test.info().project.use.baseURL });
  // `__Host-` exige Secure, Path=/ y sin Domain: se carga con `url`. Chromium trata localhost como contexto seguro (anotado en el informe).
  await context.addCookies(
    persistent.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })),
  );
  const loaded = await context.cookies();
  expect(loaded.map((c) => c.name)).toEqual(persistent.map((c) => c.name));
  return context;
}

/** Guarda en `window.__leaks` todo nodo o atributo del DOM que alguna vez contenga el nombre del paciente. */
async function watchForName(page: Page) {
  await page.addInitScript((name) => {
    const w = window as unknown as { __leaks: string[] };
    w.__leaks = [];
    const check = (node: Node) => {
      const el = node as Element;
      const texts = [node.textContent ?? '', ...(el.getAttributeNames ? el.getAttributeNames().map((a) => el.getAttribute(a) ?? '') : [])];
      if (texts.some((t) => t.includes(name))) w.__leaks.push(node.nodeName);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(check);
        else check(r.target);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  }, NAME);
}
const leaks = (page: Page) => page.evaluate(() => (window as unknown as { __leaks: string[] }).__leaks);

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test('1.1, 1.2 y 1.3: verificar lleva a P-03; solo sobrevive la cookie del dispositivo y no hay datos en el almacenamiento', async ({ page, context }) => {
  const { otp, verification } = await verifyInBrowser(page);
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  await expect(page.getByText(NAME)).toBeVisible();
  await expect(page.getByText(`Vinculación vigente hasta el ${longDate(verification.binding.expiresAt)}.`)).toBeVisible();

  const cookies = await context.cookies();
  const persistent = cookies.filter((c) => c.expires !== -1);
  expect(persistent.map((c) => c.name)).toEqual(['__Host-pe_device']);
  expect(persistent[0].expires).toBeGreaterThan(Date.now() / 1000);
  expect(cookies.find((c) => c.name === '__Host-pe_consent')!.expires).toBe(-1);

  const [me] = await Promise.all([page.waitForResponse(ME), page.reload()]);
  const session = await me.json();
  await expect(page.getByText(NAME)).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const value of [NAME, CEDULA, session.csrfToken, otp.challengeId, persistent[0].value]) {
    expect(value.length).toBeGreaterThan(5);
    expect(stored).not.toContain(value);
  }
});

test.describe('con una vinculación vigente', () => {
  let linked: BrowserContext;
  let expiresAt: string;
  test.beforeEach(async ({ browser }) => {
    linked = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    const page = await linked.newPage();
    expiresAt = (await verifyInBrowser(page)).verification.binding.expiresAt;
    await page.close();
  });
  test.afterEach(async () => {
    await linked.close();
  });

  test('2.4, 2.5 y 2.10: reabrir con las cookies persistentes muestra P-03 sin aviso, sin código y solo con GET /me', async ({ browser }) => {
    const reopened = await reopen(browser, linked);
    const page = await reopened.newPage();
    const calls: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.pathname.startsWith('/api/')) calls.push(`${r.method()} ${url.pathname}`);
    });
    await watchForName(page);
    const before = await rowMap();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
    await expect(page.getByText(NAME)).toBeVisible();
    await expect(page.getByText(`Vinculación vigente hasta el ${longDate(expiresAt)}.`)).toBeVisible();
    await expect(page.getByLabel(S.cedula, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(S.codeLabel, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toHaveCount(0);
    expect(calls).toEqual(['GET /api/v1/me']);
    expect(await rowMap()).toEqual(before);
    // 2.10: accesibilidad y teclado hasta "Revocar mi autorización".
    expect(await violations(page)).toEqual([]);
    // F011 suma dos botones antes del enlace ("Vincular otro paciente" e "Iniciar una gestión"): el enlace es el tercer Tab.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: S.revoke })).toBeFocused();
    await reopened.close();
  });

  test('2.12: una página nueva del mismo contexto (con la cookie de consentimiento) también muestra P-03', async () => {
    const page = await linked.newPage();
    const calls: string[] = [];
    page.on('request', (r) => new URL(r.url()).pathname.startsWith('/api/') && calls.push(`${r.method()} ${new URL(r.url()).pathname}`));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
    expect(calls).toEqual(['GET /api/v1/me']);
    await expect(page.getByRole('heading', { name: 'Aviso de privacidad' })).toHaveCount(0);
  });

  test('2.9: mientras responde muestra "Cargando…"; ante 500 o corte muestra el error y Reintentar lleva a P-03', async () => {
    const page = await linked.newPage();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ME, async (route) => {
      await gate;
      await route.fulfill({ status: 500, body: '{}' });
    });
    await page.goto('/');
    await expect(page.getByText(S.loading)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('link', { name: S.revoke })).toBeVisible();
    await expect(page.getByText(NAME)).toHaveCount(0);
    await page.unroute(ME);
    await page.route(ME, (route) => route.abort());
    await page.getByRole('button', { name: S.retry }).click();
    await expect(page.getByRole('button', { name: S.retry })).toBeVisible();
    await expect(page.getByText(NAME)).toHaveCount(0);
    await page.unroute(ME);
    await page.getByRole('button', { name: S.retry }).click();
    await expect(page.getByText(NAME)).toBeVisible();
  });

  test.describe('vencida', () => {
    test.beforeEach(() => {
      clock('advance', '100d');
    });

    test('3.4, 3.5 y 3.8: GET /me responde vacío, la web muestra el aviso sin el nombre, solo con los controles del aviso, y la revocación sigue disponible', async ({ browser }) => {
      const reopened = await reopen(browser, linked);
      const page = await reopened.newPage();
      await watchForName(page);
      const [me] = await Promise.all([page.waitForResponse(ME), page.goto('/')]);
      expect(me.status()).toBe(200);
      expect((await me.json()).bindings).toEqual([]);
      await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeVisible();
      await expect(page.getByRole('heading', { name: S.p03Title })).toHaveCount(0);
      // 3.5: lista cerrada de controles por nombre accesible. En el aviso real los dos botones son "Aceptar" y "No acepto"
      // (el contrato dice "Rechazar") y hay dos opciones de quién acepta (radios): ver el informe del developer.
      const names = async (role: 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'tab') =>
        Promise.all((await page.getByRole(role).all()).map((e) => e.evaluate((el) => (el.textContent || el.getAttribute('aria-label') || '').trim()).then((t) => t)));
      expect((await names('button')).sort()).toEqual([S.accept, S.reject].sort());
      expect(await names('link')).toEqual([S.revoke]);
      expect((await Promise.all((await page.getByRole('radio').all()).map((e) => e.locator('xpath=..').textContent()))).map((t) => t!.trim()).sort()).toEqual([S.authorized, S.holder].sort());
      for (const role of ['textbox', 'checkbox', 'combobox', 'tab'] as const) expect(await names(role)).toEqual([]);
      // 3.8: la revocación lleva a /revocar sin pedir el aviso.
      await page.getByRole('link', { name: S.revoke }).click();
      await expect(page).toHaveURL(/\/revocar$/);
      await expect(page.getByRole('button', { name: S.accept, exact: true })).toHaveCount(0);
      expect(await leaks(page)).toEqual([]);
      await reopened.close();
    });

    test('3.4 (iii): el nombre no aparece en el DOM en ningún momento, ni siquiera de paso', async ({ browser }) => {
      const reopened = await reopen(browser, linked);
      const page = await reopened.newPage();
      await watchForName(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeVisible();
      expect(await leaks(page)).toEqual([]);
      // Control positivo: el observador sí detecta el nombre cuando aparece.
      await page.evaluate((n) => document.body.append(Object.assign(document.createElement('p'), { textContent: n })), NAME);
      expect((await leaks(page)).length).toBeGreaterThan(0);
      await reopened.close();
    });

    test('3.6, 4.5 y 4.7: pide un código nuevo, vuelve a mostrar P-03 con el nuevo vencimiento y se reabre sin código', async ({ browser }) => {
      const reopened = await reopen(browser, linked);
      const page = await reopened.newPage();
      const posts: string[] = [];
      page.on('request', (r) => r.method() === 'POST' && posts.push(new URL(r.url()).pathname));
      const { verification } = await verifyInBrowser(page);
      expect(posts).toEqual(['/api/v1/consents/acceptance', '/api/v1/identity/otp-requests', '/api/v1/identity/verifications']);
      expect(Date.parse(verification.binding.expiresAt)).toBeGreaterThan(Date.parse(expiresAt) + 90 * 86400_000);
      await expect(page.getByText(`Vinculación vigente hasta el ${longDate(verification.binding.expiresAt)}.`)).toBeVisible();
      const rows = (await pool.query("SELECT channel FROM app.consent_records WHERE kind = 'data_processing'")).rows;
      expect(rows).toHaveLength(2);
      const again = await reopen(browser, reopened);
      const second = await again.newPage();
      await second.goto('/');
      await expect(second.getByText(NAME)).toBeVisible();
      await expect(second.getByLabel(S.codeLabel, { exact: true })).toHaveCount(0);
      await again.close();
      await reopened.close();
    });
  });
});

test('R.1: la salida de la API durante el recorrido no contiene cédulas, tokens ni números largos', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await verifyInBrowser(page);
  await page.reload();
  await expect(page.getByText(NAME)).toBeVisible();
  const token = (await context.cookies()).find((c) => c.name === '__Host-pe_device')!.value;
  const log = readFileSync(process.env.PE_API_LOG!, 'utf8');
  for (const line of log.split('\n')) expect(line).not.toMatch(/\b\d{6,12}\b/);
  for (const value of [CEDULA, '3000000001', 'paciente1@example.invalid', token]) expect(log).not.toContain(value);
  await context.close();
});
