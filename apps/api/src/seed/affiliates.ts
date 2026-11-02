import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

export interface AffiliateSeed {
  cedula: string;
  fullName: string;
  eps: 'salud_total' | 'sanitas';
  affiliationStatus: 'active' | 'inactive';
  mobilePhone: string;
  email: string | null;
}

const CEDULA = /^[0-9]{5,12}$/;
const MOBILE = /^3[0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Valida `affiliates.json` (ADR 0013). Los mensajes dicen la posición y el campo, nunca el valor:
 * son cédulas, celulares y correos (invariante 8).
 */
export function parseAffiliates(raw: string): AffiliateSeed[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('affiliates.json no es JSON válido');
  }
  if (!Array.isArray(data)) throw new Error('affiliates.json debe ser una lista');
  const seen = new Set<string>();
  return data.map((item: unknown, i: number) => {
    const where = `affiliates.json, registro ${i + 1}`;
    const a = (item ?? {}) as Record<string, unknown>;
    if (typeof a.cedula !== 'string' || !CEDULA.test(a.cedula)) throw new Error(`${where}: cédula con formato inválido`);
    if (seen.has(a.cedula)) throw new Error(`${where}: cédula repetida`);
    seen.add(a.cedula);
    if (typeof a.fullName !== 'string' || a.fullName.trim() === '') throw new Error(`${where}: fullName vacío`);
    if (a.eps !== 'salud_total' && a.eps !== 'sanitas') throw new Error(`${where}: eps no válida`);
    if (a.affiliationStatus !== 'active' && a.affiliationStatus !== 'inactive') throw new Error(`${where}: affiliationStatus no válido`);
    if (typeof a.mobilePhone !== 'string' || !MOBILE.test(a.mobilePhone)) throw new Error(`${where}: celular con formato inválido`);
    if (a.email !== null && (typeof a.email !== 'string' || !EMAIL.test(a.email))) throw new Error(`${where}: correo con formato inválido`);
    return a as unknown as AffiliateSeed;
  });
}

/**
 * Carga repetible: actualiza por cédula y retira los que ya no están en el archivo. Conserva el `id` de los
 * que siguen, porque `patient_refs.sim_affiliate_id` apunta a él.
 */
export async function seedAffiliates(pool: Pool, file: string): Promise<number> {
  const rows = parseAffiliates(readFileSync(file, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of rows) {
      await client.query(
        `INSERT INTO sim.affiliates (cedula, full_name, eps, affiliation_status, mobile_phone, email)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cedula) DO UPDATE SET full_name = EXCLUDED.full_name, eps = EXCLUDED.eps,
           affiliation_status = EXCLUDED.affiliation_status, mobile_phone = EXCLUDED.mobile_phone, email = EXCLUDED.email`,
        [a.cedula, a.fullName, a.eps, a.affiliationStatus, a.mobilePhone, a.email],
      );
    }
    await client.query('DELETE FROM sim.affiliates WHERE NOT (cedula = ANY($1::text[]))', [rows.map((a) => a.cedula)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return rows.length;
}
