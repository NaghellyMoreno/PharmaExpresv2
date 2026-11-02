import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import { parse } from 'yaml';

const doc = parse(readFileSync(resolve(import.meta.dirname, '../../../../api/openapi.yaml'), 'utf8')) as {
  components: Record<string, unknown>;
};
// ajv es CommonJS: en ESM nativo el export por defecto es el módulo y la clase está en `.default`.
const Ajv2020 = Ajv2020Module.default;
const ajv = new Ajv2020({ strict: false, allErrors: true });

/** Valida un valor contra un esquema de components.schemas de api/openapi.yaml (ADR 0017). */
export function validateAgainstSchema(name: string, value: unknown): string[] {
  const validate = ajv.compile({ $ref: `#/components/schemas/${name}`, components: doc.components });
  return validate(value) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}
