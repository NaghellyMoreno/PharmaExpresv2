# Pharma Express

Prototipo de pre-dispensación farmacéutica para los puntos de Disfarma en Manizales (web y bot de Telegram). Contexto del producto: `docs/00-contexto-producto.md`. Arquitectura: `docs/03-arquitectura.md`.

## Cómo correrlo
```bash
./init.sh
```
Instala dependencias (pnpm 12 vía Corepack), levanta PostgreSQL local, aplica migraciones, valida el contrato, corre las pruebas, compila y verifica `GET /api/v1/health`. Se puede repetir sin problema. Requiere Node.js (el proyecto fija 24.x; en 22.x funciona pero pnpm avisa).

- **Base de datos local:** con Docker usa `docker-compose.yml` (puerto 5433). Sin Docker usa PostgreSQL real con `embedded-postgres` (datos en `pgdata/`); se detiene con `pnpm --filter api db:local stop`.
- **Desarrollo:** `pnpm --filter api dev` (http://localhost:3000, rutas bajo `/api/v1`) y `pnpm --filter web dev` (proxy `/api` hacia la API).
- **Variables:** copia `.env.example` a `.env` y completa lo que necesites. Para el prototipo en local, `init.sh` usa valores por defecto sin secretos y los modos `capture` / `direct`; nada externo se llama.

## Estructura
`apps/api` (NestJS, una sola función en Vercel), `apps/web` (React + Vite), `packages/api-contract` (tipos generados de `api/openapi.yaml`), `api/openapi.yaml` (contrato), `docs/` (producto, arquitectura y ADR).

## Qué falta configurar
Todo lo externo (cuentas de textbee, Resend, QStash y Azure, dominio, teléfono Android, bots de Telegram, base de producción, variables en Vercel, datos simulados) está en la sección "Configuración antes de publicar" de `docs/03-arquitectura.md`. No bloquea el desarrollo local. Además: en `apps/web/vercel.json` el destino de la reescritura `/api` lleva el marcador `PHARMA_EXPRESS_API_DOMAIN`, que se reemplaza por el dominio del proyecto API al crearlo en Vercel.
