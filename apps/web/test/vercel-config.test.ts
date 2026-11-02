// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// F008, criterios 1.1 y 2.3: contenido de apps/web/vercel.json, sin dependencias nuevas.
const WEB_DIR = join(__dirname, '..');
const config = JSON.parse(readFileSync(join(WEB_DIR, 'vercel.json'), 'utf8')) as {
  rewrites?: Array<{ source: string; destination: string }>;
  redirects?: Array<{ source: string; destination: string }>;
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const MIN_HSTS_SECONDS = 15552000;
const SIX_ROUTES = ['/', '/revocar', '/personal', '/personal/contrasena', '/panel/dispensador/x', '/assets/index-x.js'];

function headerValues(source: string, key: string): string[] {
  return (config.headers ?? [])
    .filter((rule) => rule.source === source)
    .flatMap((rule) => rule.headers.filter((h) => h.key.toLowerCase() === key.toLowerCase()).map((h) => h.value));
}

describe('F008 2.3: reglas de headers de apps/web/vercel.json', () => {
  const SOURCE = '/(.*)';

  it('hay una regla con source literal /(.*) y coincide con las seis rutas', () => {
    expect((config.headers ?? []).some((r) => r.source === SOURCE)).toBe(true);
    const re = new RegExp('^' + SOURCE + '$');
    for (const route of SIX_ROUTES) expect(re.test(route), route).toBe(true);
  });

  it('HSTS con max-age de al menos 180 días', () => {
    const values = headerValues(SOURCE, 'Strict-Transport-Security');
    expect(values).toHaveLength(1);
    expect(Number(/max-age=(\d+)/.exec(values[0])?.[1])).toBeGreaterThanOrEqual(MIN_HSTS_SECONDS);
  });

  it('CSP con las directivas fijadas y script-src sin unsafe-inline ni unsafe-eval', () => {
    const values = headerValues(SOURCE, 'Content-Security-Policy');
    expect(values).toHaveLength(1);
    const csp = values[0];
    expect(csp.trim()).not.toBe('');
    const directives = Object.fromEntries(
      csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.split(/\s+/)[0], d.split(/\s+/).slice(1)]),
    );
    expect(directives['default-src']).toContain("'self'");
    expect(directives['frame-ancestors']).toContain("'none'");
    expect(directives['base-uri']).toContain("'self'");
    expect(directives['form-action']).toContain("'self'");
    expect(directives['script-src']).toBeDefined();
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['script-src']).not.toContain("'unsafe-eval'");
  });

  it('X-Content-Type-Options es nosniff', () => {
    expect(headerValues(SOURCE, 'X-Content-Type-Options')).toEqual(['nosniff']);
  });
});

describe('F008 2.3 y 1.1: reescrituras', () => {
  it('la reescritura de /api/:path* apunta a https:// (el marcador cuenta con https:// delante)', () => {
    const rule = (config.rewrites ?? []).find((r) => r.source === '/api/:path*');
    expect(rule).toBeDefined();
    expect(rule!.destination.startsWith('https://')).toBe(true);
  });

  it('la regla de SPA no captura /api/v1/health y sí /revocar', () => {
    const rule = (config.rewrites ?? []).find((r) => r.destination === '/index.html');
    expect(rule).toBeDefined();
    const re = new RegExp('^' + rule!.source + '$');
    expect(re.test('/api/v1/health')).toBe(false);
    expect(re.test('/revocar')).toBe(true);
  });

  it('1.1: ningún destino de rewrites o redirects es http:// (solo https:// o rutas relativas)', () => {
    const all = [...(config.rewrites ?? []), ...(config.redirects ?? [])];
    expect(all.length).toBeGreaterThan(0);
    for (const rule of all) expect(rule.destination, rule.source).toMatch(/^(https:\/\/|\/)/);
  });

  it('1.1: el código de la web y de la API no tiene URLs http:// salvo localhost', () => {
    const roots = [join(WEB_DIR, 'src'), join(WEB_DIR, '..', 'api', 'src')];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|css|html)$/.test(name)) {
          for (const m of readFileSync(path, 'utf8').matchAll(/http:\/\/[^\s'"`)]*/g)) {
            if (!/^http:\/\/localhost(:\d+)?(\/|$)/.test(m[0])) offenders.push(`${path}: ${m[0]}`);
          }
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
