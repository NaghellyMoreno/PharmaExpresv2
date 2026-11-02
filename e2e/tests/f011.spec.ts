import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';

// F011 (contracts/F011.md): un navegador vinculado a varios pacientes y selección del paciente antes de cada gestión.
// Web y API reales en modo capture. El reloj (app.test_clock) es global: este archivo corre en serie. Datos ficticios.
// Las cadenas con asterisco del anexo son Inferido hasta que la usuaria las confirme; están escritas aquí a propósito (T.1).
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pharma:pharma@localhost:5433/pharma';
const AFFILIATES = fileURLToPath(new URL('../../data/simulated/affiliates.json', import.meta.url));
const A = { cedula: '1000000001', name: 'Paciente Ficticio Uno' };
const B = { cedula: '1000000002', name: 'Paciente Ficticio Dos' };
const ME = '**/api/v1/me';

const S = {
  p03Title: 'Paciente vinculado',
  loading: 'Cargando…',
  retry: 'Reintentar',
  revoke: 'Revocar mi autorización',
  linkAnother: 'Vincular otro paciente',
  start: 'Iniciar una gestión',
  selectTitle: '¿A nombre de quién va a hacer la gestión?',
  managing: (n: string) => `Gestionando a nombre de ${n}`,
  change: 'Cambiar de paciente',
  sessionError: 'No pudimos consultar su sesión. Intente de nuevo.',
  until: (d: string) => `Vinculación vigente hasta el ${d}.`,
  notice: 'Aviso de privacidad',
  authorized: 'Actúo con su autorización',
  accept: 'Aceptar',
  cedula: 'Cédula',
  next: 'Continuar',
  codeLabel: 'Código de verificación',
  verify: 'Verificar',
  codeIncorrect: 'El código no es correcto. Revise los 6 dígitos e intente de nuevo.',
};
const ROLES = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'tab'] as const;

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
test.afterEach(() => {
  clock('reset');
});

// ---- reloj (siempre hacia adelante) ----
async function clockToBogotaNoon(date: string) {
  const { rows } = await pool.query(`SELECT floor(EXTRACT(EPOCH FROM (($1::date + time '12:00') AT TIME ZONE 'America/Bogota' - now())))::int AS o`, [date]);
  expect(rows[0].o).toBeGreaterThan(0);
  clock('set', String(rows[0].o));
}
/** Deja el reloj de la aplicación `delta` segundos antes (negativo) o después de `expires_at` de la vinculación vigente de `name`. */
async function clockNearExpiry(name: string, delta: number) {
  const { rows } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (b.expires_at - now())) AS e FROM app.channel_bindings b
     JOIN app.patient_refs p ON p.id = b.patient_ref_id JOIN sim.affiliates s ON s.id = p.sim_affiliate_id
     WHERE s.full_name = $1 AND b.revoked_at IS NULL`,
    [name],
  );
  const e = Number(rows[0].e);
  clock('set', String((delta < 0 ? Math.floor(e) : Math.ceil(e)) + delta));
}

// ---- base de datos ----
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
const bindings = async () =>
  (
    await pool.query(
      `SELECT b.id, b.patient_ref_id, b.created_at, b.expires_at, b.revoked_at, s.full_name
       FROM app.channel_bindings b JOIN app.patient_refs p ON p.id = b.patient_ref_id JOIN sim.affiliates s ON s.id = p.sim_affiliate_id
       ORDER BY b.created_at`,
    )
  ).rows;
const patientRefId = async (name: string) =>
  (await pool.query(`SELECT p.id FROM app.patient_refs p JOIN sim.affiliates s ON s.id = p.sim_affiliate_id WHERE s.full_name = $1`, [name])).rows[0].id as string;

async function smsCode(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { rows } = await pool.query<{ body: string }>("SELECT body FROM app.captured_messages WHERE channel = 'sms' ORDER BY created_at DESC LIMIT 1");
    if (rows[0]) return rows[0].body.match(/\b\d{6}\b/)![0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('No llegó el SMS capturado');
}
const longDate = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(new Date(iso));

// ---- recorridos en pantalla ----
/** Desde el aviso (P-01): acepta, escribe la cédula y deja el código listo en el campo. No pulsa "Verificar". */
async function acceptAndRequest(page: Page, cedula: string) {
  await pool.query('TRUNCATE app.otp_challenges, app.captured_messages');
  await page.getByLabel(S.authorized, { exact: true }).check();
  await page.getByRole('button', { name: S.accept, exact: true }).click();
  await page.getByLabel(S.cedula, { exact: true }).fill(cedula);
  await Promise.all([page.waitForResponse('**/api/v1/identity/otp-requests'), page.getByRole('button', { name: S.next, exact: true }).click()]);
  const code = await smsCode();
  await page.getByLabel(S.codeLabel, { exact: true }).fill(code);
  return code;
}
async function submitCode(page: Page) {
  const [verification] = await Promise.all([page.waitForResponse('**/api/v1/identity/verifications'), page.getByRole('button', { name: S.verify, exact: true }).click()]);
  return verification;
}
async function firstLink(page: Page, who: { cedula: string }) {
  await page.goto('/');
  await acceptAndRequest(page, who.cedula);
  const v = await submitCode(page);
  expect(v.status()).toBe(200);
  return v;
}
async function linkOther(page: Page, who: { cedula: string }) {
  await page.getByRole('button', { name: S.linkAnother, exact: true }).click();
  await acceptAndRequest(page, who.cedula);
  return submitCode(page);
}

/** "Cerrar el navegador": solo sobreviven las cookies persistentes. */
async function reopen(browser: Browser, previous: BrowserContext): Promise<BrowserContext> {
  const persistent = (await previous.cookies()).filter((c) => c.expires !== -1);
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', baseURL: test.info().project.use.baseURL });
  await context.addCookies(persistent.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })));
  return context;
}
async function freshContext(browser: Browser) {
  return browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
}

/** A (2026-12-01) y B (2027-02-01) en el mismo navegador, por pantalla. Devuelve un contexto reabierto con solo las cookies persistentes. */
async function twoPatients(browser: Browser): Promise<BrowserContext> {
  await clockToBogotaNoon('2026-12-01');
  const first = await freshContext(browser);
  await firstLink(await first.newPage(), A);
  await clockToBogotaNoon('2027-02-01');
  const second = await reopen(browser, first);
  await first.close();
  const page = await second.newPage();
  await page.goto('/');
  await expect(page.getByText(A.name)).toBeVisible();
  expect((await linkOther(page, B)).status()).toBe(200);
  await expect(page.getByText(B.name)).toBeVisible();
  const third = await reopen(browser, second);
  await second.close();
  return third;
}

// ---- observación del DOM y accesibilidad ----
/** Guarda en `window.__leaks` todo nodo o atributo que alguna vez contenga alguno de los textos. Instalar antes de navegar. */
async function watch(page: Page, needles: string[]) {
  await page.addInitScript((list) => {
    const w = window as unknown as { __leaks: string[]; __seen: string[] };
    w.__leaks = [];
    const check = (node: Node) => {
      const el = node as Element;
      const texts = [node.textContent ?? '', ...(el.getAttributeNames ? el.getAttributeNames().map((a) => el.getAttribute(a) ?? '') : [])];
      for (const n of list) if (texts.some((t) => t.includes(n))) w.__leaks.push(n);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(check);
        else check(r.target);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  }, needles);
}
const leaks = (page: Page) => page.evaluate(() => (window as unknown as { __leaks: string[] }).__leaks);
const resetLeaks = (page: Page) => page.evaluate(() => ((window as unknown as { __leaks: string[] }).__leaks = []));

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}
/** Nombres de los controles por rol, en orden del DOM. */
async function controls(page: Page) {
  const out: Record<string, string[]> = {};
  for (const role of ROLES) {
    out[role] = await Promise.all((await page.getByRole(role).all()).map((e) => e.evaluate((el) => (el.textContent || el.getAttribute('aria-label') || '').trim())));
  }
  return out;
}
const apiCalls = (page: Page) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/')) calls.push(`${r.method()} ${url.pathname}`);
  });
  return calls;
};

// =====================================================================================================================
test('1.2, 1.3 y 1.4: con A vigente, "Vincular otro paciente" lleva al aviso sin crear filas y verificar a B deja las dos vinculaciones', async ({ browser }) => {
  await clockToBogotaNoon('2026-12-01');
  const first = await freshContext(browser);
  await firstLink(await first.newPage(), A);
  const deviceBefore = (await first.cookies()).find((c) => c.name === '__Host-pe_device')!.value;
  await clockToBogotaNoon('2027-02-01');
  const ctx = await reopen(browser, first);
  await first.close();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  await expect(page.getByText(A.name)).toBeVisible();
  await expect(page.getByText(S.until('1 de marzo de 2027'))).toBeVisible();
  const aBefore = (await bindings())[0];
  const before = await rowMap();

  await page.getByRole('button', { name: S.linkAnother, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.notice })).toBeVisible();
  await expect(page.getByRole('button', { name: S.accept, exact: true })).toBeDisabled();
  expect(await rowMap()).toEqual(before);

  const mine = apiCalls(page);
  await acceptAndRequest(page, B.cedula);
  const [me, verification] = await Promise.all([page.waitForResponse(ME), submitCode(page)]);
  expect(verification.status()).toBe(200);
  expect((await verification.json()).binding.displayName).toBe(B.name);
  const session = await me.json();
  expect(session.bindings.map((b: { displayName: string }) => b.displayName)).toEqual([A.name, B.name]);

  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  const rows = await bindings();
  expect(rows).toHaveLength(2);
  await expect(page.getByRole('listitem')).toHaveText([`${A.name}${S.until('1 de marzo de 2027')}`, `${B.name}${S.until('1 de mayo de 2027')}`]);
  for (const [i, row] of rows.entries()) {
    expect(longDate(row.expires_at.toISOString())).toBe(['1 de marzo de 2027', '1 de mayo de 2027'][i]);
    expect(session.bindings[i].expiresAt).toBe(row.expires_at.toISOString());
  }
  expect(mine).toContain('GET /api/v1/me');

  // 1.4: A no cambió; mismo dispositivo y cookie; 1 paciente nuevo y 1 consentimiento web nuevo.
  expect(rows[0]).toEqual(aBefore);
  expect(rows[0].revoked_at).toBeNull();
  expect(Number((await pool.query('SELECT count(*) FROM app.browser_devices')).rows[0].count)).toBe(1);
  expect(Number((await pool.query('SELECT count(*) FROM app.patient_refs')).rows[0].count)).toBe(2);
  const consents = (await pool.query('SELECT channel FROM app.consent_records')).rows;
  expect(consents.map((c) => c.channel)).toEqual(['web', 'web']);
  expect((await ctx.cookies()).find((c) => c.name === '__Host-pe_device')!.value).toBe(deviceBefore);
  await ctx.close();
});

test('1.6: un código incorrecto no vincula; verificar de nuevo a un paciente vigente reutiliza su vinculación', async ({ browser }) => {
  await clockToBogotaNoon('2026-12-01');
  const first = await freshContext(browser);
  await firstLink(await first.newPage(), A);
  await clockToBogotaNoon('2027-02-01');
  const ctx = await reopen(browser, first);
  await first.close();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: S.linkAnother, exact: true }).click();
  const code = await acceptAndRequest(page, B.cedula);
  await page.getByLabel(S.codeLabel, { exact: true }).fill(code === '000000' ? '000001' : '000000');
  await page.getByRole('button', { name: S.verify, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(S.codeIncorrect);
  const before = await bindings();
  expect(before).toHaveLength(1);

  const again = await reopen(browser, ctx);
  await ctx.close();
  const p2 = await again.newPage();
  await p2.goto('/');
  await expect(p2.getByText(A.name)).toBeVisible();
  await expect(p2.getByText(B.name)).toHaveCount(0);
  expect(await bindings()).toEqual(before);

  // Con B ya vinculado, volver a verificar a A reutiliza la vinculación: siguen 2.
  await linkOther(p2, B);
  await expect(p2.getByRole('listitem')).toHaveCount(2);
  const two = await bindings();
  await linkOther(p2, A);
  await expect(p2.getByRole('listitem')).toHaveCount(2);
  expect(await bindings()).toEqual(two);
  await again.close();
});

test('2.1, 2.2, 3.1 a 3.3, 4.1 a 4.4 y 2.6: la selección, "gestión a nombre de" y que no se mezclen datos', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const idA = await patientRefId(A.name);
  const idB = await patientRefId(B.name);
  const page = await ctx.newPage();
  await watch(page, [A.name, '1 de marzo de 2027', idA]);
  const calls = apiCalls(page);
  const [meResponse] = await Promise.all([page.waitForResponse(ME), page.goto('/')]);
  const names = (await meResponse.json()).bindings.map((b: { displayName: string }) => b.displayName);
  expect(names).toEqual([A.name, B.name]);
  expect(meResponse.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // 3.2: nada identifica al paciente salvo el nombre.
  const affiliates = JSON.parse(readFileSync(AFFILIATES, 'utf8')) as Array<{ cedula: string; mobilePhone: string; email: string | null; eps: string }>;
  const forbidden = (ids: string[]) => [...affiliates.flatMap((a) => [a.cedula, a.mobilePhone, a.email ?? '', a.eps, a.eps === 'salud_total' ? 'Salud Total' : 'Sanitas']), ...ids].filter(Boolean);
  const html = async () => page.evaluate(() => document.documentElement.outerHTML);
  for (const f of forbidden([idA, idB])) expect(await html()).not.toContain(f);
  expect(await html()).toContain(A.name);
  expect(await page.getByRole('link').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/revocar']);

  // P-03 conserva sus controles.
  expect(await controls(page)).toMatchObject({ button: [S.linkAnother, S.start], link: [S.revoke] });

  // 2.1: GET /me nuevo y selección con exactamente 2 opciones.
  calls.length = 0;
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.selectTitle })).toBeVisible();
  expect(calls).toEqual(['GET /api/v1/me']);
  const selection = await controls(page);
  expect(selection).toEqual({ button: [A.name, B.name], link: [S.revoke], textbox: [], checkbox: [], radio: [], combobox: [], tab: [] });
  expect(selection.button).toEqual(names);
  await expect(page.getByText(S.managing(A.name))).toHaveCount(0);
  for (const f of forbidden([idA, idB])) expect(await html()).not.toContain(f);
  expect(await violations(page)).toEqual([]);
  // Control positivo del observador: el nombre de A sí apareció en la selección.
  expect((await leaks(page)).length).toBeGreaterThan(0);

  // 4.1, 4.2: escoger B; ningún dato de A desde el clic.
  await resetLeaks(page);
  calls.length = 0;
  await page.getByRole('button', { name: B.name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.managing(B.name) })).toBeVisible();
  expect(await controls(page)).toEqual({ button: [S.change], link: [S.revoke], textbox: [], checkbox: [], radio: [], combobox: [], tab: [] });
  expect(await leaks(page)).toEqual([]);
  expect(await page.title()).not.toContain(A.name);
  expect(calls.filter((c) => c !== 'GET /api/v1/me')).toEqual([]);
  expect(await violations(page)).toEqual([]);
  // 4.4: la selección no sale a ningún lado ni se guarda.
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const cookies = JSON.stringify(await ctx.cookies());
  for (const value of [A.name, B.name, idA, idB, A.cedula, B.cedula]) {
    expect(stored).not.toContain(value);
    expect(cookies).not.toContain(value);
    expect(page.url()).not.toContain(value);
  }

  // 2.2: "Cambiar de paciente" vuelve a preguntar; recargar también.
  await page.getByRole('button', { name: S.change, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.selectTitle })).toBeVisible();
  expect((await controls(page)).button).toEqual([A.name, B.name]);

  // 4.3: simétrico, con la lista de A (se mira el DOM de "gestión a nombre de A" sin datos de B).
  const watcher = await ctx.newPage();
  await watch(watcher, [B.name, '1 de mayo de 2027', idB]);
  await watcher.goto('/');
  await watcher.getByRole('button', { name: S.start, exact: true }).click();
  await expect(watcher.getByRole('heading', { level: 1, name: S.selectTitle })).toBeVisible();
  await resetLeaks(watcher);
  await watcher.getByRole('button', { name: A.name, exact: true }).click();
  await expect(watcher.getByRole('heading', { level: 1, name: S.managing(A.name) })).toBeVisible();
  expect(await leaks(watcher)).toEqual([]);
  await watcher.close();

  // 2.2: recargar no conserva la selección.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  await expect(page.getByText(S.managing(B.name))).toHaveCount(0);
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.selectTitle })).toBeVisible();
  await ctx.close();
});

test('2.6 y A.1: la selección se maneja solo con teclado y el foco pasa a la pantalla nueva', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  // Orden de tabulación: los controles de P-03 en orden lógico.
  for (const name of [S.linkAnother, S.start]) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: S.revoke })).toBeFocused();
  await page.getByRole('button', { name: S.start, exact: true }).focus();
  await page.keyboard.press('Enter');
  const title = page.getByRole('heading', { level: 1, name: S.selectTitle });
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: A.name, exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: B.name, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: S.managing(B.name) })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: S.change, exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { level: 1, name: S.managing(A.name) })).toBeFocused();
  expect(await violations(page)).toEqual([]);
  await ctx.close();
});

test('2.3: con una sola vinculación, "Iniciar una gestión" va directo a la gestión sin selección', async ({ browser }) => {
  const first = await freshContext(browser);
  await firstLink(await first.newPage(), A);
  const ctx = await reopen(browser, first);
  await first.close();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.managing(A.name) })).toBeVisible();
  await expect(page.getByRole('heading', { name: S.selectTitle })).toHaveCount(0);
  await ctx.close();
});

test('2.4: si A vence con la página abierta, "Iniciar una gestión" consulta GET /me y va directo a B sin mostrar a A', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const page = await ctx.newPage();
  await watch(page, [A.name]);
  await page.goto('/');
  await expect(page.getByText(A.name)).toBeVisible();
  await clockNearExpiry(A.name, 1);
  await resetLeaks(page);
  const [me] = await Promise.all([page.waitForRequest(ME), page.getByRole('button', { name: S.start, exact: true }).click()]);
  expect(me.method()).toBe('GET');
  await expect(page.getByRole('heading', { level: 1, name: S.managing(B.name) })).toBeVisible();
  await expect(page.getByRole('heading', { name: S.selectTitle })).toHaveCount(0);
  expect(await leaks(page)).toEqual([]);
  await ctx.close();
});

test('2.5: ante 500, corte de red o 401 al iniciar la gestión se muestra el error o el aviso, sin nombres ni selección', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByText(A.name)).toBeVisible();
  const expectError = async () => {
    await expect(page.getByRole('alert')).toHaveText(S.sessionError);
    await expect(page.getByRole('button', { name: S.retry, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: S.revoke })).toBeVisible();
    await expect(page.getByText(A.name)).toHaveCount(0);
    await expect(page.getByText(B.name)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: S.selectTitle })).toHaveCount(0);
  };
  await page.route(ME, (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await expectError();
  await page.unroute(ME);
  await page.route(ME, (route) => route.abort());
  await page.getByRole('button', { name: S.retry, exact: true }).click();
  await expectError();
  await page.unroute(ME);
  await page.getByRole('button', { name: S.retry, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.selectTitle })).toBeVisible();
  expect((await controls(page)).button).toEqual([A.name, B.name]);

  // 401 (cookie borrada): vuelve el aviso.
  const other = await ctx.newPage();
  await other.goto('/');
  await expect(other.getByText(A.name)).toBeVisible();
  await other.route(ME, (route) => route.fulfill({ status: 401, contentType: 'application/problem+json', body: '{"title":"x"}' }));
  await other.getByRole('button', { name: S.start, exact: true }).click();
  await expect(other.getByRole('heading', { level: 1, name: S.notice })).toBeVisible();
  await expect(other.getByText(A.name)).toHaveCount(0);
  await ctx.close();
});

test('5.3, 5.4 y 4.5: con A vencida solo queda B, sin código; la gestión va directo y B vence a los 3 meses de la suya', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  await clockNearExpiry(A.name, 1);
  const page = await ctx.newPage();
  await watch(page, [A.name, '1 de marzo de 2027']);
  const calls = apiCalls(page);
  const before = await rowMap();
  const [me] = await Promise.all([page.waitForResponse(ME), page.goto('/')]);
  expect((await me.json()).bindings.map((b: { displayName: string }) => b.displayName)).toEqual([B.name]);
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  await expect(page.getByText(B.name)).toBeVisible();
  await expect(page.getByText(S.until('1 de mayo de 2027'))).toBeVisible();
  await expect(page.getByLabel(S.cedula, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(S.codeLabel, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: S.accept, exact: true })).toHaveCount(0);
  expect(await leaks(page)).toEqual([]);
  expect(calls).toEqual(['GET /api/v1/me']);
  expect(await rowMap()).toEqual(before);

  // 5.4: "Iniciar una gestión" va directo a B.
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.managing(B.name) })).toBeVisible();
  await expect(page.getByRole('heading', { name: S.selectTitle })).toHaveCount(0);
  expect(await leaks(page)).toEqual([]);

  // B sigue 5 s antes de su vencimiento (4.5: la selección no concede acceso, recarga y vuelve a P-03).
  await clockNearExpiry(B.name, -5);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();
  await expect(page.getByText(B.name)).toBeVisible();
  // 1 s después, `GET /me` responde vacío y aparece el aviso, sin B.
  await clockNearExpiry(B.name, 1);
  await page.close();
  const late = await ctx.newPage();
  await watch(late, [B.name]);
  const [empty] = await Promise.all([late.waitForResponse(ME), late.goto('/')]);
  expect((await empty.json()).bindings).toEqual([]);
  await expect(late.getByRole('heading', { level: 1, name: S.notice })).toBeVisible();
  await expect(late.getByRole('link', { name: S.revoke })).toBeVisible();
  await expect(late.getByRole('heading', { name: S.p03Title })).toHaveCount(0);
  expect(await leaks(late)).toEqual([]);
  await ctx.close();
});

test('5.5: A pide un código nuevo con B vigente; P-03 muestra a B y luego a A con vencimiento el 1 de junio de 2027', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const before = await bindings();
  const deviceBefore = (await ctx.cookies()).find((c) => c.name === '__Host-pe_device')!.value;
  await clockNearExpiry(A.name, 1);
  const page = await ctx.newPage();
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && posts.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.getByText(B.name)).toBeVisible();
  await expect(page.getByText(A.name)).toHaveCount(0);
  await page.getByRole('button', { name: S.linkAnother, exact: true }).click();
  await acceptAndRequest(page, A.cedula);
  expect(posts.filter((p) => p.endsWith('/identity/otp-requests'))).toHaveLength(1);
  const verification = await submitCode(page);
  expect(verification.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: S.p03Title })).toBeVisible();

  const rows = await bindings();
  expect(rows).toHaveLength(3);
  const [oldA, newB, newA] = [rows[0], rows[1], rows[2]];
  expect(oldA.id).toBe(before[0].id);
  expect(oldA.revoked_at).not.toBeNull();
  expect(newB).toEqual(before[1]);
  expect(newA.full_name).toBe(A.name);
  expect(newA.revoked_at).toBeNull();
  const { rows: sql } = await pool.query(
    `SELECT to_char(created_at + interval '3 months', 'YYYY-MM-DD') AS day, created_at + interval '3 months' AS exp FROM app.channel_bindings WHERE id = $1`,
    [newA.id],
  );
  expect(sql[0].exp).toEqual(newA.expires_at);
  expect(sql[0].day).toBe('2027-06-01');
  await expect(page.getByRole('listitem')).toHaveText([`${B.name}${S.until('1 de mayo de 2027')}`, `${A.name}${S.until(longDate(newA.expires_at.toISOString()))}`]);
  await expect(page.getByText(S.until('1 de junio de 2027'))).toBeVisible();
  expect(Number((await pool.query('SELECT count(*) FROM app.patient_refs')).rows[0].count)).toBe(2);
  expect(Number((await pool.query('SELECT count(*) FROM app.browser_devices')).rows[0].count)).toBe(1);
  const cookie = (await ctx.cookies()).find((c) => c.name === '__Host-pe_device')!;
  expect(cookie.value).toBe(deviceBefore);
  expect(Math.floor(cookie.expires)).toBe(Math.floor(newA.expires_at.getTime() / 1000));
  await ctx.close();
});

test('5.6: un código incorrecto al pedir el código nuevo de A no vuelve a vincular a A', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  await clockNearExpiry(A.name, 1);
  const before = await bindings();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: S.linkAnother, exact: true }).click();
  const code = await acceptAndRequest(page, A.cedula);
  await page.getByLabel(S.codeLabel, { exact: true }).fill(code === '000000' ? '000001' : '000000');
  await page.getByRole('button', { name: S.verify, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(S.codeIncorrect);
  expect(await bindings()).toEqual(before);
  const check = await page.request.get('/api/v1/me');
  expect((await check.json()).bindings.map((b: { displayName: string }) => b.displayName)).toEqual([B.name]);
  await ctx.close();
});

test('R.1: la salida de la API en estos recorridos no contiene cédulas, nombres, tokens ni números largos', async ({ browser }) => {
  const ctx = await twoPatients(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: S.start, exact: true }).click();
  await page.getByRole('button', { name: B.name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.managing(B.name) })).toBeVisible();
  const token = (await ctx.cookies()).find((c) => c.name === '__Host-pe_device')!.value;
  const log = readFileSync(process.env.PE_API_LOG!, 'utf8');
  for (const line of log.split('\n')) expect(line).not.toMatch(/\b\d{6,12}\b/);
  for (const value of [A.cedula, B.cedula, A.name, B.name, '3000000001', '3000000002', 'paciente1@example.invalid', token]) expect(log).not.toContain(value);
  // Control positivo del detector (la API no escribe líneas en estos recorridos): una línea con una cédula sí se detecta.
  expect(`cedula ${A.cedula}`).toMatch(/\b\d{6,12}\b/);
  await ctx.close();
});
