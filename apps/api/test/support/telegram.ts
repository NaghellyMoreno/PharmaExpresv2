import type { LoggerService } from '@nestjs/common';
import type { Pool } from 'pg';
import { vi } from 'vitest';

// Ayudas compartidas de las pruebas del bot (F004). Todos los identificadores son ficticios.

export const WEBHOOK = '/api/v1/telegram/webhook';
export const A = 900000001;
export const B = 900000003;
export const C = 900000004;
/** Chat que nunca acepta el aviso. */
export const NEW_CHAT = 900000002;

let updateSeq = 800000000;
export const nextUpdateId = () => ++updateSeq;

const user = (id: number) => ({ id, is_bot: false, first_name: 'Prueba Uno', username: 'prueba_uno' });
const chat = (id: number) => ({ id, type: 'private', first_name: 'Prueba Uno', username: 'prueba_uno' });
export const message = (id: number, extra: Record<string, unknown> = { text: '/start' }, updateId = nextUpdateId()) => ({
  update_id: updateId,
  message: { message_id: 1, date: 1700000000, chat: chat(id), from: user(id), ...extra },
});
export const text = (id: number, value: string, updateId = nextUpdateId()) => message(id, { text: value }, updateId);
export const press = (id: number, data: string, updateId = nextUpdateId()) => ({
  update_id: updateId,
  callback_query: {
    id: `cb-${updateId}`,
    from: user(id),
    chat_instance: 'ci',
    data,
    message: { message_id: 2, date: 1700000000, chat: chat(id), text: 'aviso' },
  },
});

/** Mapa de filas: conteo de todas las tablas de `public`, `app` y `sim` (sin migraciones ni el reloj), obtenido al momento. */
export async function rowMap(pool: Pool): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema IN ('public', 'app', 'sim') AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE '%drizzle%migrations%' AND table_name <> 'test_clock'
     ORDER BY table_schema, table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_schema, table_name } of rows) {
    const r = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "${table_schema}"."${table_name}"`);
    counts[`${table_schema}.${table_name}`] = Number(r.rows[0].n);
  }
  return counts;
}

/** Diferencia entre dos mapas de filas: solo las tablas que cambiaron. */
export function rowDiff(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const diff: Record<string, number> = {};
  for (const key of Object.keys(after)) if (after[key] !== before[key]) diff[key] = after[key] - (before[key] ?? 0);
  return diff;
}

/** Registro del logger de Nest. */
export const logLines: string[] = [];
export const logSink: LoggerService = {
  log: (m) => logLines.push(String(m)),
  error: (m, ...r) => logLines.push([m, ...r].map(String).join(' ')),
  warn: (m) => logLines.push(String(m)),
  debug: (m) => logLines.push(String(m)),
  verbose: (m) => logLines.push(String(m)),
};

/** Ejecuta `fn` y devuelve todo lo que la API escribió en el logger y en la salida estándar. */
export async function captureLogs(fn: () => Promise<void>): Promise<string> {
  logLines.length = 0;
  const out: string[] = [];
  const spies = [process.stdout, process.stderr].map((s) =>
    vi.spyOn(s, 'write').mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as never),
  );
  try {
    await fn();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return [...logLines, ...out].join('\n');
}
