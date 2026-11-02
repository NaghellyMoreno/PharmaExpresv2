# 0005. Concurrencia de reservas: cero sobre-reservas, confirmación atómica y orden de bloqueo con la configuración

- **Estado:** Aceptada (la usuaria aprobó las propuestas de architect el 2026-11-01). Las decisiones 7 y 8 son decisiones técnicas nuevas que cierran R-08 y R-22.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.5 y 3.12; guía de agentes (architect, punto 1); HU-013, HU-014, HU-017, HU-018, HU-028, HU-029, HU-030, HU-035, HU-037; RNF-002; F030 a F032, F039, F060, F061, F073, F074, F080, F081, F085 a F087, F094, F095; `docs/04-readiness.md` (R-08, R-22)

## Contexto
Confirmado: nunca una cita sin medicamentos reservados ni una ventana sobre su capacidad; la confirmación es atómica por fórmula (P5); no se aparta cupo mientras el usuario escoge (P6); la capacidad se mide en citas (P7); una fórmula se agrega a una cita confirmada del mismo punto si cumple sus reglas, sin ocupar otro cupo (P24, P29); máximo 2 solicitudes abiertas; el administrador no puede bajar inventario ni capacidad por debajo de lo reservado, ni hacer cambios de horario que dejen por fuera ventanas con citas activas, ni quitar ventanas que las tengan; ningún ajuste cancela citas (sección 3.12). El punto solo tiene nombre y horario: no se desactiva ni se borra (usuaria, R-09).

El informe de preparación encontró dos huecos: la confirmación y los cambios de horario o de ventanas no compartían un orden de bloqueo (R-08), y no estaba definido cómo se materializan las ventanas en días con horario distinto (R-22).

## Decisión
1. **Contadores con `CHECK`:**
   - `window_slots(capacity, booked_count)` con `CHECK (0 <= booked_count AND booked_count <= capacity)`, una fila por ventana y fecha.
   - `inventory_items(on_hand, reserved)` con `CHECK (0 <= reserved AND reserved <= on_hand)`.
2. **Confirmación de una fórmula = una transacción** (`READ COMMITTED`, ADR 0003):
   - Expira primero, en la misma transacción, las citas de los puntos involucrados cuya ventana ya terminó (expiración perezosa).
   - Toma los bloqueos en el **orden común** de la decisión 7.
   - Revalida, después de bloquear, que cada ventana sigue activa y dentro del horario del punto para ese día, y las reglas de tiempo (agudo: mismo día con inicio al menos 1 h después o día siguiente; crónico o cita con algún crónico: solo el día siguiente) con `app.clock_now()` en `America/Bogota` (ADR 0021).
   - Por cada cita nueva: `UPDATE window_slots SET booked_count = booked_count + 1 WHERE id = $1 AND booked_count < capacity`; si afecta 0 filas, conflicto.
   - Por cada medicamento: `UPDATE inventory_items SET reserved = reserved + $q WHERE ... AND reserved + $q <= on_hand`; si afecta 0 filas, conflicto.
   - Si la fórmula se agrega a una cita existente, no toca `window_slots` (no ocupa cupo) y solo inserta líneas.
   - Cualquier conflicto revierte toda la transacción (ninguna cita de la fórmula queda) y la API responde 409 `slot_taken` o `stock_taken` con las opciones recalculadas.
   - Un disparador de restricción diferido (`DEFERRABLE INITIALLY DEFERRED`) comprueba al hacer commit que toda cita activa tiene al menos una línea `reserved`.
3. **Liberación:** cancelar una cita, cancelar una solicitud (HU-037), expirar, revocar o la reverificación decrementan los contadores en la misma transacción que cambia el estado, con el mismo orden de bloqueo. Lo no recogido de una fórmula con entrega parcial pasa a `lost` (sección 3.5). El cierre automático por inactividad nunca toca citas (HU-038, criterio 4).
4. **Administrador:**
   - Capacidad o existencias: `UPDATE` directo bajo el orden común; si queda por debajo de lo reservado, el `CHECK` falla y la API responde 409 con el mínimo posible. El cambio de capacidad de una plantilla se propaga a las ventanas materializadas de hoy y mañana en la misma transacción.
   - Horario y retiro de ventanas: ver decisión 7 (orden) y decisión 8 (qué queda por fuera). Un disparador impide desactivar una plantilla con ventanas futuras con `booked_count > 0`, como segunda barrera.
   - El punto no tiene columna `active` (usuaria, R-09). `PointPatch` solo admite `name` y `schedule`; cualquier otro campo se rechaza con 400 sin cambios.
5. **Máximo 2 solicitudes abiertas:** crear una solicitud bloquea la fila de `patient_refs` (`FOR UPDATE`) y cuenta las abiertas; un disparador `BEFORE INSERT` repite la verificación. "Abierta" se calcula desde el estado de sus fórmulas (ver `docs/03-arquitectura.md`, Modelo de datos).
6. **"Activa" y "reservada"** (Confirmado, propuesta aprobada; HU-029 criterio 8 y HU-030 criterio 4): cita confirmada no cancelada, no expirada y no cerrada; unidades de líneas `reserved`.
7. **Orden de bloqueo común (Decisión técnica, cierra R-08).** Toda transacción que lee o cambia cupos, ventanas u horario de un punto toma los bloqueos en este orden, y nunca al revés:
   1. `points` del punto o puntos involucrados, ordenados por id. La confirmación, la cancelación, la expiración, la revocación y la reverificación toman `FOR SHARE` (no se bloquean entre sí). Cambiar el horario, agregar o quitar una ventana y cambiar la capacidad de una plantilla toman `FOR UPDATE`.
   2. `window_templates` involucradas, por id.
   3. `window_slots`, por id.
   4. `inventory_items`, por (punto, medicamento).
   5. `appointments` y `reservation_lines`.

   Con esto, una confirmación sin commit hace esperar al cambio de horario o al retiro de la ventana, y al revés. Como en `READ COMMITTED` cada sentencia ve lo último confirmado, la revalidación de la decisión 2 (después del bloqueo del punto) ve el horario y las ventanas que dejó el administrador: no puede quedar una cita activa en una ventana retirada o fuera de horario. La materialización de ventanas toma `points FOR SHARE` e inserta con `ON CONFLICT DO NOTHING`. El ajuste de existencias del administrador solo toma `inventory_items` (paso 4), porque el `CHECK` basta. Se reintenta una vez ante interbloqueo (ADR 0003).
8. **Materialización de ventanas por día (Decisión técnica, cierra R-22).**
   - `window_templates` tiene una hora de inicio y una capacidad por punto, sin día de la semana. `point_schedules` tiene, por día de la semana, un solo intervalo de apertura y cierre; un día sin fila es un día sin atención.
   - Para la fecha D se materializa la ventana `[inicio, inicio + 1 h)` solo si el horario de ese día de la semana existe y la contiene completa (`apertura <= inicio` y `inicio + 1 h <= cierre`). En días sin atención o con horario más corto, esa ventana simplemente no existe ese día.
   - Se materializan hoy y mañana (lo único que permiten las reglas de agudo y crónico), al consultar disponibilidad y en el despacho diario.
   - "Ventanas con citas activas que quedan por fuera" (sección 3.12) = filas de `window_slots` de hoy o mañana con `booked_count > 0` cuyo intervalo deja de caber en el nuevo horario de su día. Si hay alguna, 409 con la lista; si no, se aplica el cambio y se borran las ventanas materializadas sin reservas que quedaron por fuera. Recortar horas sin citas, ampliar el horario o agregar ventanas se permite siempre.
   - Crear una ventana cuya hora no cabe en el horario de ningún día responde 422 `window_outside_schedule`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Contar citas con `SELECT count(*)` y luego insertar | Sin contadores | Condición de carrera sin bloqueo de tabla |
| `SERIALIZABLE` | Garantía genérica | Reintentos frecuentes en el último cupo; mensajes de conflicto menos claros |
| Bloqueos consultivos (`pg_advisory_xact_lock`) por punto | Simple | No protege frente a errores de código fuera de esa ruta; el bloqueo de fila del punto sí aparece en todas las rutas y lo comprueba una prueba |
| Plantillas de ventana por día de la semana | Más flexible | Más pantallas y reglas para el administrador; la sección 3.12 habla de "ventanas y su capacidad" por punto, no por día |
| Apartar cupo temporal mientras el usuario escoge | Menos conflictos | Contradice P6 (Confirmado: no se aparta cupo) |

## Consecuencias
- Prueba obligatoria (qa-evaluator): dos confirmaciones simultáneas sobre el último cupo y sobre las últimas existencias; solo una gana.
- Prueba nueva (R-08): una confirmación y un cambio de horario o retiro de la ventana concurrentes; al terminar, ninguna cita activa queda en una ventana retirada o fuera de horario.
- Una confirmación larga retrasa unos milisegundos los cambios de horario del mismo punto. Es aceptable para el volumen del prototipo.
- La expiración perezosa hace que la corrección no dependa del disparador de tareas (ADR 0011).
