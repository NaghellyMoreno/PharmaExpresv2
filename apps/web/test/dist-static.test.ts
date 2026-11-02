// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// F008, criterios 3.1 y 3.2: los estáticos compilados no contienen datos de pacientes ni de citas.
// Hoy data/simulated/ solo tiene afiliados: no hay medicamentos ni diagnósticos que buscar.
const WEB_DIR = join(__dirname, '..');
const DIST = join(WEB_DIR, 'dist');
const affiliates = JSON.parse(readFileSync(join(WEB_DIR, '..', '..', 'data', 'simulated', 'affiliates.json'), 'utf8')) as Array<
  Record<string, string | null>
>;

/** Valores de la semilla que no pueden estar en los estáticos (cédula, nombre, teléfono y correo). */
const SEED_VALUES = affiliates.flatMap((a) => [a.cedula, a.fullName, a.mobilePhone, a.email].filter((v): v is string => !!v));
const SEED_CEDULA_LITERAL = /["'`]1000000\d{3}["'`]/;
const APPOINTMENT_PATTERNS = [/"patientRefId"\s*:\s*"/, /"code"\s*:\s*"\d{8}"/];

/** Devuelve las coincidencias de un contenido; la usan las pruebas y sus controles positivos. */
function findPrivateData(content: string): string[] {
  const found: string[] = [];
  for (const v of SEED_VALUES) if (content.includes(v)) found.push(`semilla:${v}`);
  if (SEED_CEDULA_LITERAL.test(content)) found.push('literal-1000000');
  for (const re of APPOINTMENT_PATTERNS) if (re.test(content)) found.push(`patron:${re.source}`);
  return found;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function scan(dir: string): Record<string, string[]> {
  const hits: Record<string, string[]> = {};
  for (const file of listFiles(dir)) {
    const found = findPrivateData(readFileSync(file, 'latin1'));
    if (found.length) hits[file.slice(dir.length)] = found;
  }
  return hits;
}

describe('F008 3.1 y 3.2: contenido de apps/web/dist', () => {
  beforeAll(() => {
    // Compila antes de leer para no depender de un dist viejo.
    execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB_DIR, stdio: 'pipe' });
  }, 120_000);

  it('hay archivos que revisar (index.html, JS y CSS)', () => {
    const files = listFiles(DIST).map((f) => f.slice(DIST.length));
    expect(files).toContain('/index.html');
    expect(files.some((f) => f.endsWith('.js'))).toBe(true);
    expect(files.some((f) => f.endsWith('.css'))).toBe(true);
  });

  it('3.1 y 3.2: 0 coincidencias en todos los archivos de dist', () => {
    expect(scan(DIST)).toEqual({});
  });

  it('control positivo de la función de búsqueda', () => {
    const cedula = affiliates[0].cedula!;
    expect(findPrivateData(`const x = ${JSON.stringify(cedula)};`)).not.toEqual([]);
    expect(findPrivateData('{"patientRefId":"x"}')).not.toEqual([]);
    expect(findPrivateData('{"code":"12345678"}')).not.toEqual([]);
    expect(findPrivateData('const ok = "texto sin datos";')).toEqual([]);
  });

  it('control positivo sobre una copia en el directorio temporal del sistema', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'f008-dist-'));
    try {
      cpSync(DIST, tmp, { recursive: true });
      expect(scan(tmp)).toEqual({});
      writeFileSync(join(tmp, 'plantado.js'), `x = "${affiliates[0].cedula}"; y = '{"patientRefId":"x"}';`);
      expect(Object.keys(scan(tmp))).toEqual(['/plantado.js']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
