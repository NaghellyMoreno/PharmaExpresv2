# 0011. Tareas programadas, recordatorios, reverificación y cierre de solicitudes

- **Estado:** Aceptada. La usuaria escogió el disparador y las reglas de tolerancia y cierre el 2026-11-01 (cierra R-02 y la parte de arquitectura de R-05), aprobó las propuestas Inferidas de este ADR y resolvió sus Pendientes (decisiones 1 y 2 del 2026-11-01). Con la versión 7 del contexto (sección 3.5) decidió que cada espera tiene su propio recordatorio y su propio plazo (P43; cierra R-25 y R-26; reemplaza la regla de R-18). Queda la configuración de la cuenta, listada en Consecuencias.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.5, 3.6, 3.13 (punto 8) y 3.14; `CLAUDE.md` (stack); guía de agentes (architect, punto 7); RNF-013, RNF-017, RNF-020, RNF-036; HU-015, HU-021 a HU-023, HU-037, HU-038; F039, F044 a F049, F069, F070, F077, F094 a F098; `docs/04-readiness.md` (R-02, R-05, R-18, R-25, R-26)

## Contexto
Precisión que exige el contexto (Confirmado):
- Recordatorio del día anterior entre las 19:00 y las 21:00.
- Recordatorio de dos horas antes, que sale como máximo 10 minutos después de la hora programada, con reverificación. Si sale con más de 10 minutos de retraso: se envía y se reverifica si la cita no ha empezado; se omite si ya empezó; los dos casos son incumplimiento (sección 3.6).
- Un único recordatorio a las 48 horas cuando no hay disponibilidad: sale hasta 1 hora después, nunca antes; si cae entre las 21:00 y las 7:00, sale a las 7:00 (sección 3.5).
- Si al volver a validar tampoco hay disponibilidad, empieza una espera nueva con las mismas reglas: su propio recordatorio a las 48 horas y cancelación si la fórmula no se agenda en las 24 horas siguientes a ese recordatorio. Las fórmulas que quedan esperando en una misma validación comparten un solo recordatorio y un solo plazo (sección 3.5, versión 7).
- Aviso a crónicos 2 días antes de la siguiente fecha habilitada, a las 19:00 (sección 3.6).
- Cancelación por inactividad: solicitud con 24 horas sin actividad en carga o prevalidación; fórmula apta sin cita 24 horas después de prevalidarse, o 24 horas después del recordatorio de 48 horas si estaba esperando (sección 3.5).
- La reserva expira al terminar la ventana.

Presupuesto de US$0 (sección 3.9): solo servicios gratuitos o cuentas de estudiante sin tarjeta.

Restricciones de la plataforma, verificadas en la documentación de Vercel el 2026-10-31:
- Cron en Hobby: una vez al día, con precisión por hora (hasta 59 minutos de desfase).
- `@nestjs/schedule` no sirve, porque no hay un proceso permanente.
- Vercel Workflows: la integración con NestJS es experimental y no tiene soporte para desplegar en Vercel. Se descarta.

## Decisiones de la usuaria (Confirmado, 2026-11-01)
1. **Disparador preciso:** Upstash QStash, plan gratuito (opción B).
2. **Recordatorio de dos horas antes con más de 10 minutos de retraso:** si la cita no ha empezado, se envía y se reverifica; si ya empezó, se omite. En los dos casos se registra un incumplimiento.
3. **Aviso a crónicos:** sale en el despacho diario de las 19:00.
4. **Recordatorio de 48 horas:** sale hasta 1 hora después de la hora programada, nunca antes. Si la hora cae entre las 21:00 y las 7:00, sale a las 7:00. Si sale más de 1 hora tarde por una falla, se envía igual y queda como incumplimiento.
5. **Un recordatorio de 48 horas por espera** (sección 3.5, versión 7; P43). Las fórmulas que quedan sin disponibilidad en una misma validación comparten una espera, su recordatorio y su plazo. Si al volver a validar tampoco hay disponibilidad, empieza una espera nueva con su propio recordatorio. Reemplaza la regla anterior de un solo recordatorio por solicitud (R-18).
6. **Volver a validar tras las 48 horas:** en la misma solicitud, sin volver a cargar documentos.
7. **Cierre por inactividad:** como la sección 3.5. No se avisa al paciente.
8. **Cancelación:** el usuario puede cancelar una solicitud en cualquier momento.
9. **Propuestas Inferidas aprobadas:** red de seguridad cada 5 minutos; franja nocturna que incluye las 21:00 y excluye las 7:00, con la hora de tolerancia contada desde las 7:00; qué cuenta como actividad; estado final "cancelada" para fórmulas cerradas por inactividad o por el usuario; volver a validar se habilita a las 48 horas del inicio de la espera, aunque el recordatorio salga más tarde.

## Límites de QStash verificados (documentación oficial de Upstash, 2026-11-01)
| Límite del plan gratuito | Valor |
| --- | --- |
| Mensajes al día | 1.000. Cada reintento cuenta como un mensaje más |
| Retraso máximo de un mensaje | 7 días |
| Programaciones activas | 10 |
| Tamaño máximo del mensaje | 1 MB |
| Duración máxima de la respuesta HTTP | 15 minutos |
| Retención de la cola de mensajes fallidos y de los logs | 3 días |
| Paralelismo máximo | 10 |

- Firma: QStash envía un JWT en la cabecera `Upstash-Signature`. Se verifica con `Receiver` y las claves actual y siguiente, sobre el cuerpo crudo de la petición (ADR 0016, decisión 3).
- SDK: `@upstash/qstash` 2.12.1 (registro de npm, 2026-11-01).
- No verificado: si la cuenta gratuita exige tarjeta. Lo confirma la usuaria al crearla (Configuración antes de publicar).

## Decisión
1. **Despachador único e idempotente:** tabla `scheduled_jobs` y endpoint `GET|POST /api/v1/internal/jobs/dispatch` protegido por `JobSecretGuard`. Acepta dos credenciales: `Authorization: Bearer CRON_SECRET` (Vercel Cron y pruebas) y la firma de QStash (`Upstash-Signature`). El despachador toma las tareas con `due_at <= app.clock_now()` (ADR 0021) con `FOR UPDATE SKIP LOCKED`, comprueba el estado actual (cita activa, solicitud abierta, fórmula todavía en esa espera, paciente no revocado) y las ejecuta. Si una tarea ya no existe, porque se borró al revocar o se canceló, la llamada no hace nada.
2. **Tres disparadores sobre el mismo despachador:**
   - **QStash, un mensaje por tarea precisa:** al crear una tarea de dos horas antes, de 48 horas o de cierre por inactividad, se publica un mensaje con `notBefore = due_at` y el `jobId` en el cuerpo. Todas caen dentro del retraso máximo de 7 días.
   - **QStash, red de seguridad:** una programación de QStash llama al despachador cada 5 minutos (Confirmado, propuesta aprobada). Ocupa 1 de las 10 programaciones y 288 de los 1.000 mensajes diarios.
   - **Vercel Cron Hobby, respaldo diario:** `0 0 * * *` UTC, que equivale a 19:00 a 19:59 en Bogotá (Colombia no tiene horario de verano). Despacha el aviso a crónicos, los recordatorios del día anterior que sigan pendientes, la materialización de ventanas y la limpieza.
   - `SCHEDULER_MODE` (Decisión técnica): `qstash` en producción; `direct` en local, en pruebas automáticas y por defecto en vista previa, donde no se publica en QStash y el despachador se llama con `CRON_SECRET` (lo hacen las pruebas, después de mover el reloj de prueba, ADR 0021).
3. **Programación de cada tipo de tarea.** Todas las horas se calculan en `America/Bogota` con la base de datos (`AT TIME ZONE` sobre `app.clock_now()`), nunca con la zona del servidor.

| Tarea (`kind`) | Se crea cuando | `due_at` | `not_after` y conducta si sale tarde | Estado |
| --- | --- | --- | --- | --- |
| `reminder_day_before` | Se confirma una cita que no es del mismo día y se agendó antes de las 19:00 del día anterior | 19:00 del día anterior | 21:00. La red de 5 minutos lo despacha cerca de las 19:00 y el cron diario lo respalda. Después de las 21:00 se omite y queda como incumplimiento (Decisión técnica: la franja es parte de la regla) | Confirmado (sección 3.6) |
| `reminder_two_hours` | Se confirma una cita con 2 horas o más de anticipación | Inicio de la ventana menos 2 horas | `due_at` + 10 min. Si sale más tarde y la ventana no ha empezado, se envía y se reverifica (`late_sent`); si ya empezó, se omite sin reverificar (`late_skipped`) | Confirmado (usuaria) |
| `availability_48h` | Se abre una espera (`availability_waits`, decisión 7): una validación deja una o más fórmulas sin disponibilidad. Una sola por espera: índice único (`availability_wait_id`) para este tipo, sin importar su estado | `availability_waits.started_at` + 48 h; si cae en [21:00, 7:00), pasa a las 7:00 siguientes | `due_at` + 1 h. Nunca sale antes de `due_at`. Si una ejecución tardía cae en [21:00, 7:00), se reprograma a las 7:00. Si sale después de `not_after` por una falla, se envía igual (`late_sent`). Solo se envía si alguna fórmula sigue en esa espera; si no, `noop` | Confirmado (sección 3.5, versión 7; usuaria, decisión 1) |
| `chronic_next_window` | Se cierra en el punto una fórmula crónica (entregada o con entrega parcial) | 19:00 del día que queda 2 días antes de la siguiente fecha habilitada | Sale en el despacho diario de ese día | Confirmado (usuaria) |
| `request_inactivity_close` | Hay actividad en una solicitud con fórmulas en carga o prevalidación | `care_requests.last_activity_at` + 24 h | Al ejecutarse, relee `last_activity_at`; si hubo actividad después, se reprograma | Confirmado |
| `formula_unscheduled_close` | (a) Una fórmula queda apta sin cita y con disponibilidad al prevalidar o al volver a validar: una por fórmula. (b) Sale el recordatorio de una espera: una por espera, índice único (`availability_wait_id`) para este tipo | Ver decisión 7 | Si la fórmula ya tiene cita activa, ya se cerró o ya no está en esa espera, no hace nada | Confirmado (sección 3.5); el plazo tras volver a validar con disponibilidad es Inferido (HU-038, criterio 2) |
| `appointment_expiry` | Se confirma una cita | Fin de la ventana | La corrección no depende de esta tarea: la expiración es perezosa (ADR 0005) | Sin cambios |
| `ocr_result_purge`, `blob_purge` | La revocación no logró borrar de inmediato un resultado abierto en Azure o un archivo de Blob (ADR 0018) | Inmediato, con reintentos | Sin paciente: solo el identificador de la operación o la ruta aleatoria | Decisión técnica |

4. **Registro de cumplimiento.** `scheduled_jobs` guarda `executed_at`, `outcome` (`on_time`, `late_sent`, `late_skipped`, `noop`, `failed`) y `late_by_seconds`. Cualquier ejecución después de `not_after` es un incumplimiento y se registra así, también en el recordatorio de 48 horas que sale tarde por una falla. El log lleva solo el tipo de tarea, el resultado y el retraso: sin cédula, sin medicamentos, sin diagnósticos y sin destinatario (invariante 8).
5. **Reverificación** (sin cambios): ocurre dentro de la tarea de dos horas antes, en una transacción con el orden de bloqueo del ADR 0005. Consulta afiliación, vigencia y autorizaciones. Si algo cambió, la fórmula queda no apta (`not_eligible`, motivo `reverification_change`), se liberan sus medicamentos en todos los puntos y se registra `reverification_events`. Se cancelan las citas que quedan sin líneas y se conservan las demás, con la misma ventana y el mismo código. Si cambió la afiliación, afecta a todas las fórmulas de la solicitud (sección 3.6).
6. **Volver a validar tras las 48 horas** (Confirmado): `POST /patients/{p}/requests/{r}/formulas/{f}/revalidations`, en la misma solicitud. Solo se permite si la fórmula está en `scheduling` dentro de una espera y `app.clock_now() >= availability_waits.revalidate_available_at` de esa espera (48 h desde su inicio, aunque el recordatorio salga más tarde). Repite las reglas de la prevalidación con el resultado del cruce ya guardado (ADR 0012) y los datos actuales de la EPS simulada, sin llamar al OCR ni consumir cargas, y después consulta la disponibilidad.
7. **Esperas y plazos de la fórmula apta sin cita:**
   - **Qué es "una misma validación"** (lectura de la sección 3.5, Inferido en HU-015 criterio 12; Decisión técnica en cómo se modela): una misma consulta de disponibilidad, hecha en una transacción. Hay tres:
     - La que sigue a la prevalidación: al terminar la prevalidación de la solicitud, el sistema consulta en una sola operación la disponibilidad de todas sus fórmulas aptas. Las que quedan sin disponibilidad comparten una espera.
     - `checkAvailability` de una fórmula apta que no está esperando y que ya no encuentra disponibilidad (por ejemplo, porque se agotó entre la prevalidación y la consulta): abre una espera solo para esa fórmula.
     - `revalidateFormula`: cada llamada es una validación de una fórmula; si no hay disponibilidad, abre una espera nueva para ella.
   - **Modelo:** cada espera es una fila de `availability_waits` (`request_id`, `started_at`, `revalidate_available_at = started_at + 48 h`, `reminder_sent_at`). La fórmula apunta a su espera vigente con `request_formulas.availability_wait_id`. La fila se crea en la misma transacción que la consulta que la abre, así que la espera es la identidad de esa validación: no hace falta otra clave. Repetir `checkAvailability` durante la espera no abre otra ni la reinicia.
   - **Recordatorio:** una tarea `availability_48h` por espera (índice único parcial por `availability_wait_id`). Un solo mensaje por espera, aunque la compartan varias fórmulas.
   - **Plazo de una fórmula en espera:** al enviarse el recordatorio de la espera se guarda `reminder_sent_at` y se crea una tarea `formula_unscheduled_close` para esa espera con `due_at = reminder_sent_at + 24 h`. Al ejecutarse cancela (motivo `inactivity`) las fórmulas que siguen en `scheduling` con `availability_wait_id` igual a esa espera. Una fórmula que ya volvió a validar no apunta a esa espera y no se ve afectada. Como cada espera tiene su propio recordatorio, el plazo de cada fórmula se cuenta solo desde el recordatorio de su espera y nunca antes de que pueda volver a validar; ya no hace falta combinar fechas de esperas distintas (R-26).
   - **Fórmula apta sin cita y sin espera:** prevalidación + 24 h, o la validación de volver a validar con disponibilidad + 24 h (Inferido, HU-038 criterio 2). Durante una espera no aplica el plazo de 24 h desde la prevalidación (HU-038, criterio 3): al abrirse la espera se cancela la tarea por fórmula pendiente.
   - **Espera nueva:** si `revalidateFormula` no encuentra disponibilidad, la fórmula pasa a una espera nueva con su recordatorio y su plazo, con las mismas reglas. Pasa igual cada vez.
   - **Solicitud:** la tarea `request_inactivity_close` cancela las fórmulas en `loading` o `prevalidating` (motivo `inactivity`).
   - Si con el cierre todas las fórmulas de la solicitud quedan en estado final, la solicitud pasa a `closed` con `closed_reason = inactivity` (el motivo de la solicitud es el del evento que cerró su última fórmula abierta: `user_cancelled`, `inactivity` o, en cualquier otro caso, `completed`). El cierre por inactividad nunca cancela citas. No se notifica al paciente.
8. **Cancelación por el usuario** (`POST /patients/{p}/requests/{r}/cancellation`): en una transacción, cancela sus citas activas con las reglas de liberación y pérdida (ADR 0005), pasa a `cancelled` (motivo `user_cancelled`) las fórmulas no cerradas, cierra la solicitud (`closed_reason = user_cancelled`) y marca `cancelled` sus tareas pendientes, incluidas las de sus esperas. Los mensajes de QStash ya publicados llegan al despachador y no hacen nada.
9. **Presupuesto de mensajes de QStash** (Confirmado, propuesta aprobada). La red de seguridad usa 288 mensajes al día. Cada cita usa como máximo un mensaje de dos horas antes; cada espera, uno de 48 horas y uno de cierre; cada solicitud y cada fórmula apta sin espera, uno de cierre por cada reprogramación. Una espera nueva solo se abre cada 48 horas por fórmula como mínimo, así que con las pruebas de la usuaria y su equipo el volumen queda muy por debajo de los 712 mensajes diarios restantes. Si se agota la cuota, las tareas precisas se retrasan hasta el cron diario y quedan como incumplimiento.

## Alternativas consideradas
| Opción | Por qué no se escogió |
| --- | --- |
| A. Vercel Pro con cron cada minuto | Cuesta US$20 al mes; viola la restricción de US$0 |
| C. Vercel Queues con mensajes diferidos | En beta; su uso con NestJS no está documentado ni verificado |
| D. Cron externo gratuito (por ejemplo, cron-job.org) | Sin garantía de precisión verificada en documentación oficial |
| Solo el cron diario de Hobby | No cumple los 10 minutos del recordatorio de dos horas antes |
| Agrupar esperas por solicitud o por ventana de tiempo, en vez de por consulta | Contradice la sección 3.5: una fórmula podría recibir el recordatorio antes de poder volver a validar, o una espera nueva quedaría sin el suyo |
| Columnas de espera en `request_formulas`, sin tabla aparte | No hay cómo expresar en la base que varias fórmulas comparten un recordatorio y un plazo; el índice único necesita una identidad de espera |

## Consecuencias
- Cerrados R-02, R-25 y R-26; R-18 queda reemplazado por la regla de un recordatorio por espera. Cerrada la parte de arquitectura de R-05 (endpoints de cancelación y de volver a validar en `api/openapi.yaml`, columnas en el modelo).
- La prevalidación termina con una consulta de disponibilidad hecha por el sistema; `checkAvailability` sigue sirviendo para ver las opciones actuales de cada fórmula. Si un usuario vuelve a validar por separado dos fórmulas que compartían espera y ninguna encuentra disponibilidad, cada una abre su espera y recibe su recordatorio: son dos validaciones distintas (lectura Inferida de HU-015, criterio 12).
- Variables de entorno: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`, `SCHEDULER_MODE` y `PUBLIC_API_URL` (destino de los mensajes).
- Depende de un servicio externo gratuito sin acuerdo de servicio. Si QStash falla, el cron diario cubre el aviso a crónicos, el del día anterior y la limpieza, pero no el de dos horas antes, que quedaría registrado como incumplimiento.
- **Configuración antes de publicar (usuaria):** crear la cuenta de Upstash sin tarjeta y la programación de 5 minutos. No bloquea: en local y en vista previa se trabaja con `SCHEDULER_MODE=direct`.
