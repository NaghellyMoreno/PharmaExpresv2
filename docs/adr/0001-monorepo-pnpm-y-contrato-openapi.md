# 0001. Monorepo TypeScript con pnpm y tipos compartidos desde OpenAPI

- **Estado:** Aceptada (2026-11-01, la usuaria aprobó las propuestas de architect)
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** `CLAUDE.md` (stack y mapa del repositorio), guía de agentes (architect, punto 13), sección 3.14

## Contexto
El frontend (React + Vite) y el backend (NestJS) deben compartir el contrato `api/openapi.yaml` sin desviarse de él. El gestor de paquetes lo define architect (`CLAUDE.md`). Vercel debe poder construir cada parte desde el mismo repositorio.

## Decisión
1. **Gestor de paquetes:** pnpm 12 con espacios de trabajo (`pnpm-workspace.yaml`), versión fijada en `package.json` con `"packageManager": "pnpm@12.16.1"` y Corepack. Verificado: pnpm 12.16.1 es la versión publicada en el registro de npm y Vercel soporta pnpm 6 a 12, con Corepack si se usa `packageManager` (vercel.com/docs/package-managers). Confirmado (verificado); elección Inferida.
2. **Estructura:** `apps/api` (NestJS 12.3), `apps/web` (React 19.3 + Vite 8.3), `packages/api-contract`, `data/simulated`, `e2e`. Node.js 24.x en `engines` (Vercel ofrece 22.x, 24.x y 26.x; Inferido 24.x por compatibilidad de módulos nativos como `sharp` y `@node-rs/argon2`).
3. **Contrato primero:** `api/openapi.yaml` es la fuente. `openapi-typescript` 7.13 genera `packages/api-contract/src/schema.d.ts`; el frontend usa `openapi-fetch` 0.17 tipado con ese archivo; el backend tipa los cuerpos de respuesta de sus controladores con `components['schemas'][...]` del mismo paquete (las validaciones de entrada siguen en DTO de `class-validator`, ADR 0016).
4. **Control de desvío (Inferido):**
   - `pnpm contract:lint`: Redocly CLI 2.72 valida el YAML.
   - `pnpm contract:gen` + `git diff --exit-code`: el tipo generado commiteado coincide con el YAML.
   - Prueba de rutas: un test de integración lista las rutas registradas en NestJS y las compara con `paths` del contrato; falla si sobra o falta alguna.
   - Pruebas de contrato: las pruebas de integración del backend validan cada respuesta contra el esquema del contrato con Ajv 8.20 (dialecto JSON Schema 2020-12, el de OpenAPI 3.1).
   - Todo corre en `pnpm contract:check`, que llama `init.sh`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Código primero (`@nestjs/swagger` genera el YAML) | Sin duplicar tipos | El contrato dejaría de ser el acuerdo previo que escribe architect; el frontend esperaría al backend |
| npm o Yarn | Sin Corepack | Espacios de trabajo menos estrictos; pnpm evita dependencias fantasma |
| Dos repositorios | Despliegues aislados | Los crea la usuaria; duplicaría el contrato |
| Generar esquemas Zod del contrato | Validación desde una sola fuente | Agrega otra herramienta; NestJS usa `class-validator` de forma nativa |

## Consecuencias
- Cualquier cambio de API empieza por `api/openapi.yaml` (architect) y se propaga con `pnpm contract:gen`.
- El developer debe mantener DTO y contrato alineados; las pruebas de contrato lo detectan.
- Pendiente: confirmar en el primer despliegue que Vercel usa pnpm 12 vía Corepack (variable `ENABLE_EXPERIMENTAL_COREPACK=1` si la plataforma lo exige).
