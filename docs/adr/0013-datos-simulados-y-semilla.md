# 0013. Datos simulados (EPS, inventario, puntos y catálogo): formato y carga

- **Estado:** Propuesta (contenido lo entrega la usuaria)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.4, 3.8, 3.10 y 3.12; guía de agentes (architect, punto 9); RNF-006, RNF-023

## Contexto
Son simulados la EPS, el inventario, los puntos y la validación oficial. Puntos, horarios, ventanas, capacidad, inventario, catálogo de crónicos y trámites por EPS son configurables desde el panel. El contenido lo arma la usuaria; architect solo propone el formato. Nunca datos reales.

## Decisión
1. **Archivos JSON** en `data/simulated/`, uno por entidad, validados contra un esquema al cargar (la carga falla con el detalle del error):
   - `affiliates.json`: `[{ cedula, fullName, eps: "salud_total" | "sanitas", affiliationStatus: "active" | "inactive", mobilePhone, email | null }]`
   - `medications.json`: `[{ code, name, pbsCovered }]`
   - `diagnoses.json`: `[{ code, description }]`
   - `formulas.json`: `[{ number, cedula, consultationDate, validUntil, diagnosisCode, items: [{ medicationCode, quantity, authorization: { status: "authorized" | "missing" | "expired", validUntil | null } }], chronicNextEnabledDate | null }]`
   - `points.json`, `windows.json`, `inventory.json`, `chronic-diagnoses.json`, `eps-authorization-guides.json`: valores iniciales de lo configurable.
2. **Carga:** `pnpm --filter api db:seed`. `sim` se reemplaza completo; lo configurable solo se carga si está vacío (no pisa cambios del administrador).
3. **Puerto de la EPS:** `EpsGateway` con adaptador `SimulatedEpsGateway` que lee `sim`; la reverificación vuelve a consultarlo. Para simular cambios (reverificación) la usuaria edita el JSON y recarga, o el developer ofrece un comando de prueba (Inferido).
4. **Validación oficial:** la registra el dispensador en el panel; no hay sistema externo.
5. **Contactos:** los celulares y correos de `affiliates.json` deben ser los de prueba de la usuaria (sección 3.2).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| CSV | Editable en hoja de cálculo | Estructuras anidadas (ítems y autorizaciones) incómodas |
| Servicio HTTP simulado aparte | Más realista | Otro despliegue; no aporta al prototipo |

## Consecuencias
- Pendiente (usuaria): entregar el contenido, incluido el diagnóstico de cada fórmula, la vigencia (8 a 9 meses tras la consulta en los datos de prueba) y la cobertura PBS (que sea atributo del medicamento es Inferido).
