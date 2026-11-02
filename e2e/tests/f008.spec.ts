import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DIST_DIR, VERCEL_JSON, startDistServer, type DistServer } from './support/dist-server';

// F008, criterios 2.4 (la CSP no rompe la web) y 3.3 (el servidor entrega los estáticos sin variar).
// La API real es la de playwright.config.ts (puerto 3100, APP_ORIGIN = http://localhost:4173).
const API_PORT = 3100;
const API_ORIGIN = 'http://localhost:4173';
const TITLE = 'Aviso de privacidad y tratamiento de datos personales';
const REJECTED = 'Sin aceptar el aviso no podemos continuar por la web. Puede acudir a la atención presencial.';
const fileCsp = VERCEL_JSON.headers.find((h) => h.source === '/(.*)')!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;

/** Recorre P-01, rechazo, /revocar y P-02 y devuelve las violaciones de CSP vistas (eventos y consola). */
async function walkScreens(page: Page, origin: string): Promise<string[]> {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), e.violatedDirective];
    });
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(`consola: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (/Content Security Policy/i.test(e.message)) violations.push(`error: ${e.message}`);
  });
  const collect = async () => {
    const seen = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
    violations.push(...seen.map((d) => `evento: ${d}`));
  };

  // P-01
  await page.goto(`${origin}/`);
  await page.getByRole('heading', { level: 1, name: TITLE, exact: true }).waitFor({ timeout: 5_000 }).catch(() => undefined);
  const heading = await page.getByRole('heading', { level: 1, name: TITLE, exact: true }).count();
  const acceptDisabled = await page.getByRole('button', { name: 'Aceptar', exact: true }).isDisabled({ timeout: 1_000 }).catch(() => false);
  await collect();
  // Rechazo
  if (heading) await page.getByRole('button', { name: 'No acepto', exact: true }).click();
  const rejected = await page.getByText(REJECTED, { exact: true }).count();
  await collect();
  // /revocar
  await page.goto(`${origin}/revocar`);
  const revoke = await page.getByRole('heading', { level: 1, name: 'Revocar mi autorización', exact: true }).count();
  await collect();
  // P-02: acepta como titular y espera el campo de cédula
  await page.goto(`${origin}/`);
  let cedula = 0;
  if (heading) {
    await page.getByLabel('Soy el titular', { exact: true }).check();
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await page.getByLabel('Cédula', { exact: true }).waitFor({ timeout: 5_000 }).catch(() => undefined);
    cedula = await page.getByLabel('Cédula', { exact: true }).count();
  }
  await collect();
  walkScreens.controls = { heading, acceptDisabled, rejected, revoke, cedula };
  return violations;
}
walkScreens.controls = {} as Record<string, unknown>;

test.describe('F008 2.4: la CSP del ADR 0002 no rompe la web actual', () => {
  let server: DistServer;
  test.beforeAll(async () => {
    server = await startDistServer({ apiPort: API_PORT, apiOrigin: API_ORIGIN });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test('la respuesta de / lleva exactamente la CSP de vercel.json', async () => {
    const res = await fetch(`${server.origin}/`);
    expect(res.headers.get('content-security-policy')).toBe(fileCsp);
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('las cuatro pantallas cargan con 0 violaciones de CSP', async ({ page }) => {
    const violations = await walkScreens(page, server.origin);
    expect(walkScreens.controls).toEqual({ heading: 1, acceptDisabled: true, rejected: 1, revoke: 1, cedula: 1 });
    expect(violations).toEqual([]);
  });
});

test.describe('F008 2.4: control positivo', () => {
  test('con la CSP default-src none el recorrido detecta al menos 1 violación', async ({ page }) => {
    const strict = await startDistServer({ apiPort: API_PORT, apiOrigin: API_ORIGIN, cspOverride: "default-src 'none'" });
    try {
      const violations = await walkScreens(page, strict.origin);
      expect(violations.length).toBeGreaterThanOrEqual(1);
    } finally {
      await strict.close();
    }
  });
});

test.describe('F008 3.3: el servidor entrega los estáticos sin variar', () => {
  let server: DistServer;
  test.beforeAll(async () => {
    server = await startDistServer({ apiPort: API_PORT, apiOrigin: API_ORIGIN });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test('/, /revocar y /personal devuelven dist/index.html byte a byte', async () => {
    const index = readFileSync(join(DIST_DIR, 'index.html'));
    for (const route of ['/', '/revocar', '/personal']) {
      const res = await fetch(`${server.origin}${route}`);
      expect(res.status, route).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).equals(index), route).toBe(true);
    }
  });

  test('cada JS y CSS referenciado por el HTML es igual al de dist y trae su Content-Type', async () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    expect(assets.some((a) => a.endsWith('.js'))).toBe(true);
    expect(assets.some((a) => a.endsWith('.css'))).toBe(true);
    for (const asset of assets) {
      const res = await fetch(`${server.origin}/${asset}`);
      expect(res.status, asset).toBe(200);
      expect(res.headers.get('content-type'), asset).toMatch(asset.endsWith('.js') ? /^text\/javascript/ : /^text\/css/);
      expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(join(DIST_DIR, asset))), asset).toBe(true);
    }
  });
});
