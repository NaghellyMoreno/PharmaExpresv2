#!/usr/bin/env bash
# init.sh: levanta el entorno local y corre la prueba de humo.
# Se puede ejecutar varias veces seguidas. No imprime secretos ni lee .env.
set -euo pipefail
cd "$(dirname "$0")"

# Valores solo para desarrollo local (sin secretos reales). Si ya exportaste
# DATABASE_URL, se respeta.
export DATABASE_URL="${DATABASE_URL:-postgres://pharma:pharma@localhost:5433/pharma}"
export SCHEDULER_MODE="${SCHEDULER_MODE:-direct}"
export MESSAGING_MODE="${MESSAGING_MODE:-capture}"
export OCR_PROVIDER="${OCR_PROVIDER:-capture}"
SMOKE_PORT=3999
mkdir -p .run

# Corre un comando sin ruido; si falla, muestra su salida completa y termina.
run_quiet() {
  if ! "$@" >.run/last.log 2>&1; then cat .run/last.log; echo "Falló: $*" >&2; exit 1; fi
  echo "OK: $*"
}

echo "== Dependencias"
if ! command -v pnpm >/dev/null 2>&1; then corepack enable; fi
pnpm install --frozen-lockfile 2>&1 | tail -3

echo "== Base de datos"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose up -d --wait db 2>&1 | tail -2
else
  echo "Docker no está disponible: se usa PostgreSQL local de desarrollo (embedded-postgres, puerto 5433)."
  pnpm --filter api db:local start
fi
pnpm --filter api db:migrate

echo "== Contrato"
run_quiet pnpm contract:check

echo "== Pruebas"
run_quiet pnpm test
grep -E "Test Files|Tests " .run/last.log || true

echo "== Compilación"
run_quiet pnpm build

echo "== Pruebas de interfaz (Playwright y axe, Chromium)"
pnpm --filter e2e install:browsers >.run/browsers.log 2>&1 || { cat .run/browsers.log; exit 1; }
run_quiet pnpm test:e2e
grep -E "passed|failed" .run/last.log || true

echo "== Prueba de humo (GET /api/v1/health)"
PORT=$SMOKE_PORT node apps/api/dist/main.js >/dev/null 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$SMOKE_PORT/api/v1/health" -o .run/health.json 2>/dev/null; then break; fi
  sleep 1
done
grep -q '"status":"ok"' .run/health.json
cat .run/health.json; echo

echo "Listo. Para desarrollo: pnpm --filter api dev (http://localhost:3000) y pnpm --filter web dev."
