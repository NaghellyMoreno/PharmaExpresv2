import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';
const NOTICE = '**/api/v1/privacy-notice';
const ACCEPT = '**/api/v1/consents/acceptance';

const S = {
  declaration: 'Soy el titular o actúo con su autorización',
  holder: 'Soy el titular',
  authorized: 'Actúo con su autorización',
  accept: 'Aceptar',
  reject: 'No acepto',
  revoke: 'Revocar mi autorización',
  rejected: 'Sin aceptar el aviso no podemos continuar por la web. Puede acudir a la atención presencial.',
  back: 'Volver al aviso',
  loadError: 'No pudimos cargar el aviso de privacidad. Intente de nuevo.',
  retry: 'Reintentar',
  acceptError: 'No pudimos registrar su aceptación. Intente de nuevo.',
  soon: 'Esta opción estará disponible próximamente.',
  cedula: 'Cédula',
  next: 'Continuar',
};
const TEXT_INPUTS = 'input[type=text], input[type=tel], input[type=email], input[type=number], input[name*=cedula i]';

/** Peticiones hechas por la página (para comprobar que no hay POST ni llamadas a /identity). */
function trackRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => seen.push(r));
  return seen;
}
const apiCalls = (seen: Request[]) => seen.filter((r) => new URL(r.url()).pathname.startsWith('/api/'));
async function storageEmpty(page: Page) {
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
}
async function noSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}
async function realNotice(page: Page) {
  const res = await page.request.get('/api/v1/privacy-notice');
  expect(res.status()).toBe(200);
  return res.json() as Promise<{ version: string; title: string; body: string; declaration: string; revocationOption: { label: string; cedulaUseNotice: string } }>;
}

// ---------- Paso 1 ----------
test.describe('paso 1: la web abre con el aviso', () => {
  test('1.2 y T.1: título, texto y declaración; los textos vienen de la API', async ({ page }) => {
    const notice = await realNotice(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(notice.title);
    await expect(page.getByText(notice.body, { exact: true })).toBeVisible();
    await expect(page.getByText(S.declaration, { exact: true })).toBeVisible();
    expect(notice.declaration).toBe(S.declaration);
    expect(notice.title).toBe('Aviso de privacidad y tratamiento de datos personales');
    await expect(page.getByLabel(S.holder, { exact: true })).toBeVisible();
    await expect(page.getByLabel(S.authorized, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.reject, exact: true })).toBeVisible();
    await expect(page.getByText(notice.revocationOption.cedulaUseNotice, { exact: true })).toBeVisible();
    expect(notice.revocationOption.cedulaUseNotice).toBe('La cédula se usa solo para verificar la identidad y atender la solicitud.');
  });

  test('1.2: con la respuesta simulada la pantalla muestra exactamente esos textos', async ({ page }) => {
    await page.route(NOTICE, async (route) => {
      const real = await (await route.fetch()).json();
      await route.fulfill({ json: { ...real, title: 'Título de prueba 1', body: 'Cuerpo de prueba 1' } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Título de prueba 1');
    await expect(page.getByText('Cuerpo de prueba 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Aviso de privacidad y tratamiento de datos personales')).toHaveCount(0);
  });

  test('1.3: no hay campo de cédula ni inputs de texto, correo o teléfono', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator(TEXT_INPUTS)).toHaveCount(0);
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
  });

  test('1.4: "Revocar mi autorización" es visible sin aceptar y se alcanza con teclado', async ({ page }) => {
    const notice = await realNotice(page);
    await page.goto('/');
    const link = page.getByRole('link', { name: S.revoke, exact: true });
    await expect(link).toBeVisible();
    await expect(page.getByText(notice.revocationOption.cedulaUseNotice, { exact: true })).toBeVisible();
    for (let i = 0; i < 10 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
  });

  test('1.5: al cargar solo hay peticiones GET y el navegador no tiene cookies', async ({ page, context }) => {
    const seen = trackRequests(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(seen.map((r) => r.method()).filter((m) => m !== 'GET')).toEqual([]);
    expect(apiCalls(seen).map((r) => `${r.method()} ${new URL(r.url()).pathname}`)).toEqual(['GET /api/v1/privacy-notice']);
    expect(await context.cookies()).toEqual([]);
  });

  test('1.6: solo con teclado se elige quién acepta y se activan "Aceptar" y "No acepto"; axe sin graves', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noSeriousViolations(page);
    // Teclado: Tab hasta la primera opción, flecha para la segunda, Tab a "Aceptar".
    await page.getByLabel(S.holder, { exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel(S.authorized, { exact: true })).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.reject, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(S.rejected, { exact: true })).toBeVisible();
    await noSeriousViolations(page);
  });

  test('1.7: el enlace de revocación es /revocar y abre sin aceptar, sin cédula, sin POST ni cookies', async ({ page, context }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: S.revoke, exact: true });
    expect(await link.getAttribute('href')).toBe('/revocar');
    const seen = trackRequests(page);
    await link.click();
    await expect(page).toHaveURL(/\/revocar$/);
    await expect(page.getByRole('heading', { level: 1, name: S.revoke, exact: true })).toBeVisible();
    await expect(page.getByText(S.soon, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: S.reject, exact: true })).toHaveCount(0);
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    expect(seen.filter((r) => r.method() === 'POST')).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    await noSeriousViolations(page);
  });

  for (const [caso, fallar] of [
    ['red abortada', (r: import('@playwright/test').Route) => r.abort()],
    ['respuesta 500', (r: import('@playwright/test').Route) => r.fulfill({ status: 500, body: 'error' })],
  ] as const) {
    test(`1.8: si el aviso falla (${caso}) hay mensaje y "Reintentar", sin botones de aceptar`, async ({ page, context }) => {
      await page.route(NOTICE, fallar);
      await page.goto('/');
      await expect(page.getByText(S.loadError, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: S.retry, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: S.accept, exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: S.reject, exact: true })).toHaveCount(0);
      await expect(page.locator(TEXT_INPUTS)).toHaveCount(0);
      const link = page.getByRole('link', { name: S.revoke, exact: true });
      await expect(link).toBeVisible();
      expect(await link.getAttribute('href')).toBe('/revocar');
      expect(await context.cookies()).toEqual([]);
      await storageEmpty(page);
      await noSeriousViolations(page);
      // Con la API ya respondiendo bien, "Reintentar" muestra el aviso completo.
      await page.unroute(NOTICE);
      await page.getByRole('button', { name: S.retry, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeVisible();
    });
  }
});

// ---------- Paso 2 y paso 3 (conteo de filas de la visita) ----------
async function countRows(pool: Pool): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%drizzle%migrations%'
     ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of rows) {
    const r = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "public"."${table_name.replace(/"/g, '""')}"`);
    counts[table_name] = Number(r.rows[0].n);
  }
  return counts;
}

test.describe('paso 2: rechazar, y paso 3: sin registro de la visita', () => {
  let pool: Pool;
  let before: Record<string, number>;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    before = await countRows(pool);
    console.log('Filas por tabla (public) antes de la visita:', JSON.stringify(before));
  });
  test.afterAll(async () => {
    const after = await countRows(pool);
    console.log('Filas por tabla (public) después de la visita:', JSON.stringify(after));
    await pool.end();
    expect(after).toEqual(before);
  });

  test('2.1, 2.2, 2.3 y 3.1: rechazar muestra la atención presencial, no envía nada y se puede volver', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const seen = trackRequests(page);
    await page.getByRole('button', { name: S.reject, exact: true }).click();
    await expect(page.getByText(S.rejected, { exact: true })).toBeVisible();
    await expect(page.getByText(/atención presencial/)).toBeVisible();
    await expect(page.locator(TEXT_INPUTS)).toHaveCount(0);
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    expect(apiCalls(seen)).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    await storageEmpty(page);
    await page.getByRole('button', { name: S.back, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeVisible();
    expect(apiCalls(seen)).toEqual([]);
  });
});

// ---------- Pasos 4 y 5 ----------
async function chooseAndAccept(page: Page, option: string) {
  await page.getByLabel(option, { exact: true }).check();
  const [req, res] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/v1/consents/acceptance')),
    page.waitForResponse(ACCEPT),
    page.getByRole('button', { name: S.accept, exact: true }).click(),
  ]);
  return { req, res };
}
async function consentCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === '__Host-pe_consent');
}

test.describe('paso 4: aceptar', () => {
  test('4.8: recorrido completo (rechazo, contexto nuevo, Aceptar deshabilitado, tercero) y 5.1', async ({ browser }) => {
    // (a) rechazo en un contexto limpio.
    const first = await browser.newContext();
    const p1 = await first.newPage();
    const seen1 = trackRequests(p1);
    await p1.goto('/');
    await p1.getByRole('button', { name: S.reject, exact: true }).click();
    await expect(p1.getByText(S.rejected, { exact: true })).toBeVisible();
    expect(apiCalls(seen1).map((r) => r.method())).toEqual(['GET']);
    expect(await first.cookies()).toEqual([]);
    // (b) se cierra y se abre otro contexto limpio.
    await first.close();
    const context = await browser.newContext();
    const page = await context.newPage();
    const seen = trackRequests(page);
    const notice = await realNotice(page);
    await page.goto('/');
    // (c) sin elegir nada, "Aceptar" está deshabilitado y no envía petición.
    const accept = page.getByRole('button', { name: S.accept, exact: true });
    await expect(accept).toBeDisabled();
    await accept.click({ force: true });
    expect(seen.filter((r) => r.method() === 'POST')).toEqual([]);
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    // (d) tercero.
    const { req, res } = await chooseAndAccept(page, S.authorized);
    expect(JSON.parse(req.postData() ?? '{}')).toEqual({ noticeVersion: notice.version, declarant: 'third_party' });
    expect(req.postData()).toContain('"declarant":"third_party"');
    expect(res.status()).toBe(204);
    const cookie = await consentCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    expect((await context.cookies()).map((c) => c.name)).not.toContain('__Host-pe_device');
    // 5.1: aparece P-02 con el campo "Cédula" y el botón.
    await expect(page.getByLabel(S.cedula, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.next, exact: true })).toBeVisible();
    await noSeriousViolations(page);
    // 5.3 de F001 (el esqueleto de P-02 no enviaba nada) lo sustituye F003: ver e2e/tests/f003.spec.ts.
    expect(seen.filter((r) => r.method() === 'POST')).toHaveLength(1);
    await context.close();
  });

  test('4.8: como titular el cuerpo lleva "holder"', async ({ page, context }) => {
    await page.goto('/');
    const { req, res } = await chooseAndAccept(page, S.holder);
    expect(req.postData()).toContain('"declarant":"holder"');
    expect(res.status()).toBe(204);
    expect(await consentCookie(context)).toBeDefined();
  });

  test('5.1: antes de la respuesta 204 el campo de cédula no está en el DOM', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ACCEPT, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/');
    await page.getByLabel(S.holder, { exact: true }).check();
    await page.getByRole('button', { name: S.accept, exact: true }).click();
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    release();
    await expect(page.getByLabel(S.cedula, { exact: true })).toBeVisible();
  });

  for (const [caso, status] of [['409', 409], ['403', 403]] as const) {
    test(`5.2: si la aceptación falla con ${caso} hay error, sigue P-01 y no hay cédula`, async ({ page }) => {
      await page.route(ACCEPT, (r) => r.fulfill({ status, contentType: 'application/problem+json', body: '{}' }));
      await page.goto('/');
      await chooseAndAccept(page, S.holder);
      await expect(page.getByText(S.acceptError, { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    });
  }

  test('5.2: si la red cae al aceptar hay error y no hay cédula', async ({ page }) => {
    await page.route(ACCEPT, (r) => r.abort());
    await page.goto('/');
    await page.getByLabel(S.holder, { exact: true }).check();
    await page.getByRole('button', { name: S.accept, exact: true }).click();
    await expect(page.getByText(S.acceptError, { exact: true })).toBeVisible();
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
  });

  test('5.4: recargar después de aceptar vuelve a P-01 y no hay estado en el navegador', async ({ page }) => {
    await page.goto('/');
    await chooseAndAccept(page, S.holder);
    await expect(page.getByLabel(S.cedula, { exact: true })).toBeVisible();
    await storageEmpty(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel(S.cedula)).toHaveCount(0);
    await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeVisible();
  });
});
