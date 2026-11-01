# 0005. Concurrencia de reservas: cero sobre-reservas y confirmación atómica

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.5 y 3.12; guía de agentes (architect, punto 1); HU-013, HU-014, HU-017, HU-018, HU-029, HU-030, HU-035; RNF-002; F030 a F032, F039, F073, F074, F080, F081, F086, F087

## Contexto
Confirmado: nunca una cita sin medicamentos reservados ni una ventana sobre su capacidad; la confirmación es atómica por fórmula (P5); no se aparta cupo mientras el usuario escoge (P6); capacidad medida en citas (P7); una fórmula se agrega a una cita confirmada del mismo punto si cumple sus reglas, sin ocupar otro cupo (P24, P29); máximo 2 solicitudes abiertas; el administrador no puede bajar inventario ni capacidad por debajo de lo reservado y ningún ajuste cancela citas.

## Decisión
1. **Contadores con `CHECK`:**
   - `window_slots(capacity, booked_count)` con `CHECK (0 <= booked_count AND booked_count <= capacity)`, una fila por ventana y fecha (hoy y mañana se materializan desde `window_templates`).
   - `inventory_items(on_hand, reserved)` con `CHECK (0 <= reserved AND reserved <= on_hand)`.
2. **Confirmación de una fórmula = una transacción:**
   - Expira primero, en la misma transacción, las citas del punto cuya ventana terminó (expiración perezosa).
   - Bloquea filas en orden determinista para evitar interbloqueos: `window_slots` por id, luego `inventory_items` por (punto, medicamento), luego `appointments` existentes a las que se agrega la fórmula (`FOR UPDATE`).
   - Revalida las reglas de tiempo (agudo: mismo día con inicio al menos 1 h después o día siguiente; crónico o cita con algún crónico: solo el día siguiente) con la hora de la base de datos en `America/Bogota`.
   - Por cada cita nueva: `UPDATE window_slots SET booked_count = booked_count + 1 WHERE id = $1 AND booked_count < capacity`; si afecta 0 filas, conflicto.
   - Por cada medicamento: `UPDATE inventory_items SET reserved = reserved + $q WHERE ... AND reserved + $q <= on_hand`; si afecta 0 filas, conflicto.
   - Si la fórmula se agrega a una cita existente, no toca `window_slots` (no ocupa cupo) y solo inserta líneas.
   - Cualquier conflicto revierte toda la transacción (ninguna cita de la fórmula queda) y la API responde 409 `slot_taken` o `stock_taken` con las opciones recalculadas.
   - Un disparador de restricción diferido (`DEFERRABLE INITIALLY DEFERRED`) comprueba al hacer commit que toda cita activa tiene al menos una línea `reserved`.
3. **Liberación:** cancelar, expirar, revocar o la reverificación decrementan los contadores en la misma transacción que cambia el estado. Lo no recogido de una fórmula con entrega parcial pasa a `lost` (sección 3.5).
4. **Administrador:** fija capacidad o existencias con `UPDATE` directo; si queda por debajo de lo reservado, el `CHECK` falla y la API responde 409 con el mínimo posible. El cambio de capacidad de una plantilla se propaga a las ventanas materializadas futuras en la misma transacción, bajo `FOR UPDATE`. Quitar una ventana o cambiar el horario se valida bloqueando la fila del punto y comprobando ventanas con citas activas; un disparador impide desactivar plantillas con ventanas futuras con `booked_count > 0`.
5. **Máximo 2 solicitudes abiertas:** crear una solicitud bloquea la fila de `patient_refs` (`FOR UPDATE`) y cuenta las abiertas; un disparador `BEFORE INSERT` repite la verificación.
6. **"Activa" y "reservada"** (Inferido, HU-029 criterio 8 y HU-030 criterio 4): cita confirmada no cancelada, no expirada y no cerrada; unidades de líneas `reserved`.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Contar citas con `SELECT count(*)` y luego insertar | Sin contadores | Condición de carrera sin bloqueo de tabla |
| `SERIALIZABLE` | Garantía genérica | Reintentos frecuentes en el último cupo; mensajes de conflicto menos claros |
| Bloqueos consultivos (`pg_advisory_xact_lock`) por ventana | Simple | No protege frente a errores de código fuera de esa ruta; el `CHECK` sí |
| Apartar cupo temporal mientras el usuario escoge | Menos conflictos | Contradice P6 (Confirmado: no se aparta cupo) |

## Consecuencias
- Prueba obligatoria (qa-evaluator): dos confirmaciones simultáneas sobre el último cupo y sobre las últimas existencias; solo una gana.
- La expiración perezosa hace que la corrección no dependa del disparador de tareas (ADR 0011).
