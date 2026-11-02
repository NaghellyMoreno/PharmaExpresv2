# 0013. Datos simulados (EPS, inventario, puntos y catálogo), semillas de prueba y su carga

- **Estado:** Aceptada (2026-11-01). El contenido lo entrega la usuaria (sección 3.8). Las decisiones 6 y 7 son decisiones técnicas nuevas que responden a RP-01 y RP-02 de `docs/02-requisitos.md`.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.4, 3.8, 3.10 y 3.12; guía de agentes (architect, punto 9); RNF-006, RNF-023; `docs/02-requisitos.md` (RP-01, RP-02); ADR 0012 (coincidencia por CIE-10 y descripción)

## Contexto
Son simulados la EPS, el inventario, los puntos y la validación oficial. Puntos, horarios, ventanas, capacidad, inventario, catálogo de crónicos y trámites por EPS son configurables desde el panel. El contenido lo arma la usuaria; architect solo propone el formato. Nunca datos reales. La coincidencia con la EPS simulada usa el código CIE-10 y, si no aparece, la descripción del diagnóstico (sección 3.4). El panel del dispensador (prioridad 7) se prueba antes de que el administrador pueda crear cuentas (prioridad 8), y varias funcionalidades necesitan cambiar existencias sin el panel (RP-01, RP-02).

## Decisión
1. **Archivos JSON** en `data/simulated/`, uno por entidad, validados contra un esquema al cargar (la carga falla con el detalle del error, sin imprimir valores de cédulas, diagnósticos ni medicamentos):
   - `affiliates.json`: `[{ cedula, fullName, eps: "salud_total" | "sanitas", affiliationStatus: "active" | "inactive", mobilePhone, email | null }]`
   - `medications.json`: `[{ code, name, pbsCovered }]`
   - `diagnoses.json`: `[{ code, description }]`. **Los dos campos son obligatorios** (cierra el pendiente del ADR 0012): `code` es un código CIE-10 con forma válida (letra, dos dígitos y, opcional, punto y más caracteres; Decisión técnica de validación de formato, no de catálogo) y único; `description` es texto no vacío. En la base: `sim.diagnoses(code PRIMARY KEY, description NOT NULL CHECK (length(trim(description)) > 0))`.
   - `formulas.json`: `[{ number, cedula, consultationDate, validUntil, diagnosisCode, items: [{ medicationCode, quantity, authorization: { status: "authorized" | "missing" | "expired", validUntil | null } }], chronicNextEnabledDate | null }]`. `diagnosisCode` debe existir en `diagnoses.json` (clave foránea).
   - `points.json`, `windows.json`, `inventory.json`, `chronic-diagnoses.json`, `eps-authorization-guides.json`: valores iniciales de lo configurable. `points.json` solo tiene nombre y horario por día de la semana (sin `active`, R-09).
2. **Carga:** `pnpm --filter api db:seed`. `sim` se reemplaza completo; lo configurable solo se carga si está vacío (no pisa cambios del administrador).
3. **Puerto de la EPS:** `EpsGateway` con adaptador `SimulatedEpsGateway` que lee `sim`; la reverificación y volver a validar lo consultan de nuevo.
4. **Validación oficial:** la registra el dispensador en el panel; no hay sistema externo.
5. **Contactos:** los celulares y correos de `affiliates.json` son los de prueba de la usuaria (sección 3.2).
6. **Semilla de personal (RP-01, Decisión técnica):**
   - `pnpm --filter api db:seed-staff` crea el primer administrador con un enlace de definición de contraseña (en todos los entornos) y, **solo en local y en vista previa**, dos dispensadores de prueba activos, con contraseña definida, asignados a dos puntos distintos de `points.json` (los dos primeros en orden alfabético).
   - Los correos salen de `SEED_ADMIN_EMAIL` y `SEED_DISPENSER_EMAILS` (correos de prueba de la usuaria) y la contraseña de los dispensadores de `SEED_DISPENSER_PASSWORD`; nunca están en el repositorio. Se guarda solo el hash Argon2id; la contraseña debe cumplir la política del ADR 0014.
   - El comando se niega a crear dispensadores de prueba si `VERCEL_ENV=production` o si la base tiene `pharma.environment = 'production'` (ADR 0021). En producción las cuentas de dispensador solo las crea el administrador (F071).
   - Las acciones del comando quedan en la auditoría con el actor `system`.
7. **Comandos de datos de prueba (RP-02, Decisión técnica)**, solo fuera de producción (misma barrera de la decisión 6):
   - `pnpm --filter api sim:stock --point <nombre> --medication <código> --on-hand <n>`: fija existencias en `app.inventory_items`. Respeta el `CHECK reserved <= on_hand` y el orden de bloqueo del ADR 0005; si queda por debajo de lo reservado, falla sin cambios.
   - `pnpm --filter api sim:apply <archivo.json>`: aplica cambios puntuales a `sim` (afiliación, vigencia, autorización, fecha habilitada) para probar la reverificación y volver a validar, sin recargar todo.
   - Los dos comandos usan el usuario de base de datos de la semilla, no el de la aplicación, y no envían notificaciones (el sistema no vigila el inventario, sección 3.6).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| CSV | Editable en hoja de cálculo | Estructuras anidadas (ítems y autorizaciones) incómodas |
| Servicio HTTP simulado aparte | Más realista | Otro despliegue; no aporta al prototipo |
| Endpoints HTTP de prueba para semillas e inventario | Se llaman desde Playwright | Superficie de ataque nueva en la función publicada; los comandos bastan y no existen en producción |
| Dispensadores de prueba también en producción | Demostración sin pasos previos | Cuentas con contraseña conocida en el sitio publicado; el administrador las crea en minutos |

## Consecuencias
- Pendiente de contenido (usuaria, sección 3.8): EPS, inventario, puntos, catálogo y documentos de prueba que muestren el número de fórmula, la cédula y el código CIE-10 o la descripción de cada diagnóstico. La cobertura PBS como atributo del medicamento es Confirmada (propuesta aprobada).
- Las pruebas de extremo a extremo llaman a estos comandos desde Playwright con `child_process`, contra la base local o la rama de Neon de la vista previa.
