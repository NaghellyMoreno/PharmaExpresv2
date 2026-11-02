# Revisión de preparación para la implementación

- **Fecha:** 2026-11-01
- **Veredicto:** PASS
- **Revisor:** readiness-reviewer
- **Entradas revisadas:** `docs/00-contexto-producto.md` (versión 7, fuente de verdad; secciones 3.3, 3.5 y 3.13), `CLAUDE.md`, `docs/guia-agentes.md`, y lo que cambió desde la revisión anterior (FAIL del 2026-11-01, R-25 a R-33): `docs/01-brief.md`, `docs/02-requisitos.md` (HU-015, HU-038, RNF-003, RNF-020, RP-03, "Orden de construcción y dependencias"), `feature_list.json` (F001 a F004, F011 a F014, F033 a F036, F047, F094 a F098), `docs/03-arquitectura.md`, `api/openapi.yaml` (versión 0.3.0) y `docs/adr/0004`, `0007`, `0011` y `0016`. Revisión acotada: lo que no cambió conserva el resultado de la revisión anterior. No se leyó código.

## Resumen
Los 9 hallazgos de la revisión anterior quedaron así: 8 cerrados (R-25 a R-32) y 1 abierto (R-33, menor, de la usuaria). Aparecen 3 hallazgos nuevos, todos menores.

La regla de la sección 3.5 (versión 7) dice: una espera, un recordatorio, y cancelación 24 horas después de ese recordatorio; las fórmulas que quedan esperando en una misma validación comparten recordatorio y plazo. Esa regla está igual en HU-015 (criterios 2, 8, 10 y 12), HU-038 (criterio 3), RNF-020, F047, F096, F097 y F098, el ADR 0011 (decisiones 5 y 7), la arquitectura (tabla `availability_waits`, índices únicos por espera en `scheduled_jobs`, tareas programadas) y el contrato (`startPrevalidation`, `checkAvailability`, `revalidateFormula`, `AvailabilityResult.reminderScheduled`, `FormulaView.availabilityWait`). Que "una misma validación" sea una misma consulta de disponibilidad está marcado como Inferido en HU-015 (criterio 12) y en el brief. Es una lectura directa de la sección 3.5 y no bloquea.

Sin regresiones. La trazabilidad sigue completa en las dos direcciones: F001 a F100, HU-001 a HU-038 y las 61 operaciones. Todas las `$ref` del contrato existen. Ninguna funcionalidad depende de otra de prioridad mayor. Los invariantes 1 a 8 y la protección contra sobre-reservas no cambiaron, y no entra ningún servicio de pago.

Aviso de architect: si el usuario vuelve a validar antes de que salga el recordatorio de la primera espera, ese recordatorio no se envía. Eso no choca con la sección 3.5. Es consecuencia de una propuesta que la usuaria ya aprobó: volver a validar se habilita a las 48 horas, aunque el recordatorio salga más tarde (ADR 0011, decisión 9). El recordatorio existe para retomar una espera que el usuario ya retomó. Lo que falta es escribir ese caso en HU-015 y probarlo en F047 (R-34, menor).

Conteo: 0 críticos, 0 mayores y 4 menores (R-33, R-34, R-35 y R-36). Se puede empezar la implementación; los menores se corrigen durante ella.

## Hallazgos
| ID | Severidad | Archivo y sección | Problema | Responsable |
| --- | --- | --- | --- | --- |
| R-33 | Menor | `CLAUDE.md` ("Fuente de verdad del producto ... versión 6, aprobada") | Sigue abierto. `CLAUDE.md` cita la versión 6 del contexto y la vigente es la 7. Los demás documentos ya citan la versión 7 | usuaria |
| R-34 | Menor | `docs/02-requisitos.md` (HU-015, criterio 9); `feature_list.json` (F047, pasos 5 a 7); `docs/adr/0011-tareas-programadas-y-recordatorios.md` (Decisión 3, fila `availability_48h`: "Solo se envía si alguna fórmula sigue en esa espera; si no, `noop`") | **Recordatorio que no sale porque el usuario ya volvió a validar.** La arquitectura no envía el recordatorio de una espera si ninguna fórmula sigue en ella. Esto pasa si el usuario vuelve a validar entre la marca de 48 horas y el envío: hasta 1 hora de tolerancia, o hasta las 7:00 si la marca cae de noche. No contradice la sección 3.5. Volver a validar a las 48 horas, aunque el recordatorio salga más tarde, es una propuesta aprobada (ADR 0011, decisión 9), y el recordatorio sirve para volver a validar ("Desde él se vuelve a validar"). Si una de las fórmulas sigue en la espera, el recordatorio sí sale. Pero HU-015, criterio 9, solo cubre la fórmula cerrada y la solicitud cancelada, y ningún paso de F047 prueba este caso. Además, el paso 7 de F047 ("exactamente dos recordatorios ... uno por la primera espera") solo se cumple si el paso 6 se hace después de recibir el primer recordatorio, y el paso 6 dice "Cumplidas las 48 horas de esa espera". Hay que agregar el caso a HU-015, criterio 9, marcado como Inferido (consecuencia de la propuesta aprobada). En F047 hay que agregar un paso: volver a validar antes de que salga el recordatorio y verificar que no se envía. También hay que precisar en el paso 6 que se vuelve a validar después de recibir el primer recordatorio | product-manager |
| R-35 | Menor | `docs/01-brief.md` (Preguntas resueltas, fila 43) | La fila de P43 termina en `F098 \|\| R-23 \| ...`. La fila de R-23 quedó pegada a la de P43 en la misma línea y la tabla no muestra R-23 como fila propia. Es un error de formato | product-manager |
| R-36 | Menor | `feature_list.json` (F097, paso 3: "volver a validar esa solicitud"); `api/openapi.yaml` (`revalidateFormula`, por fórmula); `docs/adr/0011-tareas-programadas-y-recordatorios.md` (Consecuencias, segunda viñeta) | F097 habla de volver a validar "la solicitud", pero el contrato y F096 lo hacen por fórmula: cada llamada es una validación propia. Si dos fórmulas comparten una espera y el bot las vuelve a validar una por una, sin disponibilidad, quedan en dos esperas con dos recordatorios. El ADR 0011 lo acepta como lectura Inferida. Hay que alinear F097 con F096 ("volver a validar la fórmula") para que el bot no se construya como una sola acción sobre la solicitud que en realidad abre varias esperas | product-manager |

## Verificaciones con resultado
| Área | Resultado | Apoyo |
| --- | --- | --- |
| Historia → funcionalidad | Completa: HU-001 a HU-038. HU-015 → F033, F034, F047, F096 y F097; HU-038 → F098 | `docs/02-requisitos.md` (Trazabilidad) |
| Funcionalidad → historia o RNF | Completa: F001 a F100. El campo `stories` coincide con la tabla de trazabilidad, también en F011 a F014, F035 y F036, que recibieron pasos movidos | `feature_list.json`; `docs/02-requisitos.md` (Trazabilidad) |
| Funcionalidad → endpoints y pantallas | Completa: F001 a F100. F003 y F004 llevan `accepted_at` (R-29); F011 lleva la cookie renovada (R-28); F013 lleva `POST /patients/{p}/health-data-authorizations`; F035 lleva los rechazos movidos desde F013; F047 y F098 llevan `startPrevalidation`, `checkAvailability`, `revalidateFormula` y el despachador | `docs/03-arquitectura.md` (Funcionalidad → endpoints → pantallas) |
| Endpoint → funcionalidad | Las 61 operaciones sirven a alguna funcionalidad. `POST /patients/{p}/health-data-authorizations` → F013, F015; `GET /patients/{p}/appointments` → F035, F039; `revalidations` → F047, F096, F098 | `docs/03-arquitectura.md` (Endpoint → funcionalidades) |
| Funcionalidad que depende de un endpoint inexistente | Ninguna | `feature_list.json`; `api/openapi.yaml` |
| Prioridades sin dependencias hacia prioridades mayores | Cumple. F011, F012 y F014 (prioridad 2) solo remiten a F035 y F036 ("se verifica en"). F013 pasó a prioridad 3 y usa F015, de la misma prioridad. F096 y F097 (prioridad 5) remiten a F047 y F098 (prioridad 6), sin depender de ellas. Las remisiones de este tipo están permitidas por la regla de "Orden de construcción y dependencias" | `docs/02-requisitos.md` (Orden de construcción y dependencias, R-07 y R-27) |
| Contrato consigo mismo | Todas las `$ref` a `schemas`, `responses` y `parameters` existen, incluidas `RevalidationResult`, `AvailabilityResult`, `FormulaClosedReason` y `AuditEvent`. `AuditEvent` admite actor nulo y `system` y exige `result` (R-30). La descripción general limita el control de `Origin` a las mutaciones del navegador (R-31) | `api/openapi.yaml` (versión 0.3.0; components) |
| Contrato frente a la arquitectura | Coherente: `availability_waits` ↔ `FormulaView.availabilityWait` (`waitingSince`, `revalidateAvailableAt`, `canRevalidate`); `reminderScheduled` siempre `true` con `no_availability`, una por espera; `consent_records.accepted_at` ↔ `verifyIdentity`; `audit_events` ↔ `AuditEvent`; cookie `__Host-pe_device` vuelta a emitir con el vencimiento más tardío ↔ `Set-Cookie` de `verifyIdentity` | `docs/03-arquitectura.md` (Modelo de datos; Autenticación); `api/openapi.yaml` |
| Regla de esperas de la sección 3.5 (versión 7) | Igual en todos los documentos: una espera por consulta de disponibilidad que deja fórmulas sin disponibilidad; un recordatorio por espera (índice único parcial por `availability_wait_id`); plazo de 24 horas desde el envío de ese recordatorio (`formula_unscheduled_close` por espera); espera nueva al volver a validar sin disponibilidad; mientras la fórmula espera, no aplica el plazo desde la prevalidación. El caso del recordatorio que no sale queda en R-34 | ADR 0011 (decisiones 5 y 7); `docs/03-arquitectura.md` (Tareas programadas; `scheduled_jobs`); HU-015, criterios 8, 10 y 12; HU-038, criterio 3; F047; F098, pasos 5 a 7 |
| Inferidos vigentes | HU-015, criterio 12 ("una misma validación" = una misma consulta) y HU-038, criterio 2 (plazo desde volver a validar con disponibilidad) están marcados como Inferidos, listados en el brief, y no bloquean | `docs/01-brief.md` (Preguntas abiertas, último párrafo) |
| Estados | Sin cambios y coherentes. La espera no es un estado nuevo: es `scheduling` con `availability_wait_id`, y un `CHECK` exige que solo las fórmulas en `scheduling` tengan espera | `docs/03-arquitectura.md` (Estados; `request_formulas`) |
| Invariantes 1 a 8 | Sin regresiones. Invariante 3: la aceptación sigue fuera de la base de datos hasta la verificación (cookie firmada o conversación), y ahora se guarda su fecha real (`accepted_at`, `CHECK accepted_at <= recorded_at`). Invariante 8: los incumplimientos y la auditoría siguen sin cédulas, diagnósticos ni medicamentos | ADR 0004; ADR 0016 (decisión 9); `docs/03-arquitectura.md` (`consent_records`, `audit_events`) |
| Cero sobre-reservas | Sin cambios: el ADR 0005 no cambió y la espera no reserva nada ("no se crea un pendiente") | ADR 0005; `checkAvailability` |
| Sección 3.13 | Sin regresiones. El control de `Origin` cubre las mutaciones del navegador y la prueba de rutas lo comprueba; el webhook y el despachador siguen con su secreto o su firma | ADR 0016 (decisión 6 y Consecuencias) |
| Sección 3.3 (3 meses por vinculación) | Cumple: cada vinculación vence a los 3 meses de su creación (`CHECK`) y la cookie nunca vence antes que la vinculación vigente más tardía | ADR 0007 (decisión 1); F011, pasos 1 y 5 |
| Presupuesto de US$0 | Sin cambios. Volumen de QStash: un mensaje de recordatorio y uno de cierre por espera, como máximo una espera nueva cada 48 horas por fórmula; queda dentro de los 712 mensajes diarios disponibles | ADR 0011 (decisión 9) |
| Publicación y stack | Sin cambios; cumple `CLAUDE.md` | ADR 0001 y 0002 |
| Fuera de alcance | No se coló nada: la espera no crea pendientes y el sistema no vigila el inventario | HU-015, criterios 1 y 4; F033 |

## Matriz de trazabilidad
| Funcionalidad | Historias | Endpoints | Pantallas o comandos | Estado |
| --- | --- | --- | --- | --- |
| F001, F002 | HU-001 | `GET /privacy-notice`, `POST /consents/acceptance`; webhook | P-01; B-01 | OK (R-29 cerrado) |
| F003 a F006 | HU-002, HU-003 | `POST /identity/otp-requests`, `POST /identity/verifications` (`accepted_at`); webhook; `test:clock` | P-02; B-02 | OK |
| F007, F008 | RNF-013, RNF-012 | Webhook con secreto; cabeceras; `GET /health` | Ninguna o todas | OK |
| F009, F010, F067, F068 | HU-004 | `GET /me`, `DELETE /me/bindings/{p}`; webhook; `test:clock` | P-02, P-03; B-02, B-03 | OK |
| F011, F012, F014 | HU-001, HU-004, HU-005 | `POST /identity/*`, `GET /me`; webhook; `test:clock` | P-02, P-03; B-03 | OK (R-27 y R-28 cerrados) |
| F013 | HU-004 | `POST /patients/{p}/health-data-authorizations` (403) | P-04 | OK (prioridad 3) |
| F015 a F019 | HU-006 a HU-008 | `GET /health-data-notice`, `POST .../health-data-authorizations`, `.../upload-intents`, `.../completion`, `GET .../requests/{r}`; webhook | P-04, P-06, P-07; B-04, B-06, B-07 | OK |
| F020 a F027, F089, F090 | HU-009 a HU-012; RNF-030, RNF-031 | `POST .../prevalidation` (consulta de disponibilidad al terminar), `GET .../requests/{r}`; webhook | P-07; B-07 | OK |
| F028 a F032, F080, F081, F086, F087 | HU-013, HU-014 | `POST .../availability-checks`, `POST .../confirmations`; webhook | P-08, P-09; B-08, B-09 | OK |
| F033, F034, F096, F097 | HU-015 | `POST .../availability-checks`, `POST .../revalidations`, `GET .../requests/{r}` (`availabilityWait`); webhook; `sim:stock`, `sim:apply`, `test:clock` | P-08; B-08 | OK; R-36 (F097) |
| F035 a F039, F099 | HU-016 a HU-018, HU-020, HU-035 | `GET /patients/{p}/appointments[/{a}]`, `GET /me`, `GET /patients/{p}/requests`, `POST .../cancellation`, despachador, `line-closures` | P-03, P-09, D-03; B-03, B-09 | OK (reciben los pasos movidos de F011 a F014) |
| F040, F041, F092, F093, F100 | HU-001, HU-019, HU-020 | `POST /revocations/otp-requests`, `POST /revocations`; webhook | P-01, P-10, D-03; B-01, B-10 | OK |
| F042, F043, F066 | HU-004, HU-019, HU-020, HU-037 | Bandeja de salida, `PUT`/`DELETE /me/push-subscription`, cancelaciones, despachador | P-11 | OK |
| F044 | HU-021 | `GET /internal/jobs/dispatch` | Mensajes | OK |
| F045, F046, F077 | HU-022 | `POST /internal/jobs/dispatch`, `POST .../appointments/{a}/cancellation`; `sim:apply`, `test:clock` | P-09, B-09 | OK |
| F047 | HU-015 | `POST .../prevalidation`, `POST .../availability-checks`, `POST .../revalidations`, despachador, `POST .../requests/{r}/cancellation`; `test:clock`, `sim:stock` | Mensajes | OK; R-34 |
| F048 | HU-023 | `line-closures`, despachador diario; `test:clock` | D-03 | OK |
| F049 | RNF-013 | Despachador (`jobBearer`, `schedulerSignature`) | Ninguna | OK |
| F050 a F054, F056, F057, F082 | HU-024 a HU-026, HU-034, HU-036 | `/staff/sessions*`, `/staff/password-*`, `/dispenser/*`; `db:seed-staff`, `test:clock` | S-01, S-02, D-01 a D-03 | OK |
| F055, F058 a F065, F071 a F075, F078, F079, F083 a F085 | HU-024, HU-027 a HU-034, HU-036 | `/admin/*`, `/staff/*` | A-01 a A-08, S-01, S-02 | OK (R-30 y R-31 cerrados) |
| F069, F070, F094, F095, F098 | HU-035, HU-037, HU-038 | `GET`/`POST /patients/{p}/requests`, `POST .../requests/{r}/cancellation`, `POST .../prevalidation`, `POST .../availability-checks`, `POST .../revalidations`, despachador | P-05, P-07; B-05 | OK (F098 cubre la espera compartida y la espera nueva) |
| F076, F088, F091 | RNF-021, RNF-022, RNF-029 | Todas las pantallas y consultas normales | Todas | OK |

## Seguimiento de la revisión anterior (R-25 a R-33)
| ID | Estado | Evidencia |
| --- | --- | --- |
| R-25 | Cerrado | La usuaria resolvió P43 en la sección 3.5 de la versión 7 ("empieza una espera nueva con las mismas reglas: su propio recordatorio a las 48 horas y cancelación ... en las 24 horas siguientes a ese recordatorio"). Lo aplican: ADR 0011, decisiones 5 y 7 (sin la lectura anterior de una espera sin recordatorio); tabla `availability_waits`; índices únicos por `availability_wait_id` para `availability_48h` y para `formula_unscheduled_close` de espera; `revalidateFormula` ("su propio recordatorio a las 48 horas"); `reminderScheduled` siempre `true`; HU-015, criterio 10; P43 resuelta en el brief; F047, pasos 6 y 7; F096, paso 7; F098, paso 7 |
| R-26 | Cerrado | La sección 3.5 (versión 7) dice que las fórmulas que quedan esperando en una misma validación comparten un solo recordatorio y un solo plazo. Cada espera tiene su recordatorio y el plazo de cada fórmula se cuenta solo desde el recordatorio de su espera, así que desaparece la combinación `max(...)` (ADR 0011, decisión 7; HU-015, criterio 12; HU-038, criterio 3; F047, paso 5; F098, paso 6). Lo que cuenta como "una misma validación" queda como Inferido y no bloquea |
| R-27 | Cerrado | F011 y F012 (prioridad 2) solo verifican el nombre y la ausencia de datos del otro paciente; F013 pasó a prioridad 3 y usa F015; F014 ya no pide citas; los pasos movidos están en F035 y F036 (prioridad 5) (`docs/02-requisitos.md`, "Ajustes de R-27") |
| R-28 | Cerrado | ADR 0007, decisión 1: la cookie se vuelve a emitir en cada verificación correcta, con el mismo token y el `expires_at` más tardío; `verifyIdentity` (`Set-Cookie`); F011, pasos 1 y 5 |
| R-29 | Cerrado | `consent_records.accepted_at` con `CHECK accepted_at <= recorded_at` (ADR 0004; `docs/03-arquitectura.md`, modelo y Autenticación); F001 y F002 remiten a F003 y F004, que verifican la fecha de la aceptación y no la de la verificación |
| R-30 | Cerrado | `AuditEvent` con `actorId` y `actorRole` que admiten null, `system` y `result` obligatorio; `audit_events` con `CHECK` de actor (ADR 0016, decisión 9) |
| R-31 | Cerrado | ADR 0016, decisión 6 y Consecuencias; descripción general de `api/openapi.yaml`; `docs/03-arquitectura.md` (Seguridad, punto 4) |
| R-32 | Cerrado | RP-03 figura como "Confirmado: resuelto por architect en el ADR 0021"; RNF-003 cita la versión 7 |
| R-33 | Abierto (menor) | `CLAUDE.md` sigue citando la versión 6 (ver tabla de hallazgos) |

## Seguimiento de la revisión del 2026-10-31 (R-01 a R-24)
Sin cambios respecto al informe anterior, salvo los residuos que ya se cerraron: R-05 y R-18 (con R-25 y R-26; R-18 queda reemplazado por la regla de un recordatorio por espera) y R-07 (con R-27). R-20 sigue cerrado en parte, por R-33.

| ID | Estado | Evidencia |
| --- | --- | --- |
| R-01 | Cerrado | Sección 3.2 (versión 7) pide la declaración; HU-019, criterios 5 y 16; ADR 0018, decisión 2; `RevocationInput.declarant` obligatorio; `consent_records.declarant NOT NULL`; pasos en F040, F041, F092 y F093 |
| R-02 | Cerrado | La usuaria escogió QStash; ADR 0011, decisiones de la usuaria 1 a 4; HU-022, criterio 11; HU-023, criterio 4 |
| R-03 | Cerrado | textbee y Resend escogidos (ADR 0009); lo que falta es configuración externa con modo `capture` (RNF-036) |
| R-04 | Cerrado | La sección 3.4 (versión 7) define la coincidencia; Azure Read (ADR 0012); `sim.diagnoses` con código y descripción obligatorios (ADR 0013); HU-008, criterio 7; F017 |
| R-05 | Cerrado | HU-037 y HU-038; `cancelCareRequest`, `revalidateFormula`; cierres por inactividad (ADR 0011, decisiones 6 a 8). El ciclo de espera repetido quedó definido con R-25 |
| R-06 | Cerrado | ADR 0021 (`app.clock_now()` y `test:clock`); RP-03 actualizado (R-32) |
| R-07 | Cerrado | Completado con R-27 |
| R-08 | Cerrado | ADR 0005, decisión 7 |
| R-09 | Cerrado | `points` sin `active`; `PointPatch` solo admite nombre y horario; P44 sigue abierta y no bloquea |
| R-10 | Cerrado | 6 dígitos (ADR 0006), 8 dígitos y cámara más campo numérico (ADR 0015), 15 caracteres sin filtradas (ADR 0014) |
| R-11 | Cerrado | 21 ADR Aceptados |
| R-12 | Cerrado | P37 a P40 resueltas (ADR 0019 y 0020) |
| R-13 | Cerrado | Tabla "Endpoint → funcionalidades" |
| R-14 | Cerrado | `createStaffSession` responde siempre 401 genérico, sin 429 |
| R-15 | Cerrado | ADR 0016, decisión 9 |
| R-16 | Cerrado | Tabla de estados y `FormulaStatus` |
| R-17 | Cerrado | `official_validations.notes` (ADR 0016, decisión 10) |
| R-18 | Reemplazado | Sección 3.5 (versión 7): un recordatorio por espera (ADR 0011, decisión 5) |
| R-19 | Cerrado | ADR 0006, decisión 6 |
| R-20 | Cerrado en parte | El invariante 3 recoge la excepción de la revocación; la versión del contexto en `CLAUDE.md` sigue desfasada (R-33) |
| R-21 | Cerrado | `GET /health-data-notice` |
| R-22 | Cerrado | ADR 0005, decisión 8 |
| R-23 | Cerrado | Opción (a) del ADR 0010 (HU-020, criterio 6) |
| R-24 | Cerrado | HMAC como huella cifrada (HU-019, criterio 5; ADR 0018, decisión 7) |

## Qué debe corregir cada agente
- **Usuaria:**
  1. Actualizar a la versión 7 la referencia al contexto en `CLAUDE.md` (R-33).
  2. Responder P44 cuando quiera (no bloquea).
- **Product-manager:**
  1. Agregar a HU-015, criterio 9, el caso del recordatorio que no sale porque el usuario ya volvió a validar, marcado como Inferido. Agregar a F047 un paso que lo pruebe y precisar en el paso 6 que se vuelve a validar después de recibir el primer recordatorio (R-34).
  2. Separar las filas de P43 y R-23 en las preguntas resueltas del brief (R-35).
  3. Alinear el paso 3 de F097 con F096: volver a validar la fórmula, no la solicitud (R-36).
- **Architect:** nada pendiente de esta revisión.

Veredicto PASS: no hay hallazgos críticos ni mayores. Se puede empezar la implementación por la prioridad 1. Los cuatro menores se corrigen durante ella: R-34 y R-36 antes de construir F047 y F097.
