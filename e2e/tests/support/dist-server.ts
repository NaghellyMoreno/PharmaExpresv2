import { readFileSync, statSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Servidor de prueba de F008 (criterios 2.4 y 3.3): sirve apps/web/dist como lo haría Vercel según
// apps/web/vercel.json, que se lee en tiempo de ejecución (no se copian los valores). Solo node:http.
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web');
export const DIST_DIR = join(WEB_DIR, 'dist');
export const VERCEL_JSON = JSON.parse(readFileSync(join(WEB_DIR, 'vercel.json'), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
};

export interface DistServer {
  origin: string;
  close: () => Promise<void>;
}

/**
 * `apiPort`: las peticiones /api/... van a la API real en ese puerto (el origen se reescribe a `apiOrigin`,
 * porque la API solo acepta el APP_ORIGIN configurado). `cspOverride` sustituye la CSP (control positivo).
 */
export async function startDistServer(opts: { apiPort: number; apiOrigin: string; cspOverride?: string }): Promise<DistServer> {
  const headerRule = VERCEL_JSON.headers.find((h) => h.source === '/(.*)');
  if (!headerRule) throw new Error('vercel.json no tiene la regla de headers /(.*)');
  const spaRule = VERCEL_JSON.rewrites.find((r) => r.destination === '/index.html');
  if (!spaRule) throw new Error('vercel.json no tiene la reescritura SPA');
  const spaRe = new RegExp('^' + spaRule.source + '$');

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const proxied = httpRequest(
        { host: '127.0.0.1', port: opts.apiPort, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${opts.apiPort}`, origin: opts.apiOrigin } },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on('error', () => {
        res.writeHead(502).end();
      });
      req.pipe(proxied);
      return;
    }
    for (const { key, value } of headerRule.headers) {
      res.setHeader(key, key.toLowerCase() === 'content-security-policy' && opts.cspOverride ? opts.cspOverride : value);
    }
    let file = join(DIST_DIR, normalize(url.pathname));
    let isFile = file.startsWith(DIST_DIR) && statSync(file, { throwIfNoEntry: false })?.isFile();
    if (!isFile) {
      if (!spaRe.test(url.pathname)) {
        res.writeHead(404).end();
        return;
      }
      file = join(DIST_DIR, 'index.html');
      isFile = true;
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.writeHead(200).end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
