# 0004. Garantía de los invariantes en la base de datos y en la API

- **Estado:** Aceptada (2026-11-01, la usuaria aprobó las propuestas de architect)
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01; fecha de la aceptación por R-29)
- **Fuente:** `CLAUDE.md` (invariantes 1 a 8), secciones 3.1 a 3.6, 3.10 y 3.13; RNF-001 a RNF-008, RNF-015, RNF-028

## Contexto
Los invariantes no pueden depender de la interfaz. Cada uno necesita una barrera en la API y, cuando es posible, otra en la base de datos.

## Decisión
| Invariante | Barrera en la API | Barrera en la base de datos |
| --- | --- | --- |
| 1. Sin medicamentos ni diagnósticos en notificaciones ni enlaces; enlaces al bot sin datos sensibles | Plantillas cerradas con parámetros tipados (fecha, hora, nombre del punto, conteos, códigos de motivo); los enlaces al bot no llevan parámetro `start` con datos (ADR 0010) | `notification_outbox.params` validado por plantilla con disparador que rechaza claves fuera de la lista |
| 2. Ninguna cita sin medicamentos reservados; ninguna ventana sobre su capacidad; todo o nada por fórmula | Confirmación en una transacción por fórmula, con el orden de bloqueo común frente a los cambios de horario y ventanas (ADR 0005) | `CHECK booked_count <= capacity`; `CHECK reserved <= on_hand`; disparador de restricción diferido "cita activa con al menos una línea reservada"; ediciones del administrador que violan los `CHECK` fallan |
| 3. Nada antes de aceptar; datos de salud autorizados antes de cargar. Excepción: la revocación, que solo conserva la prueba con la declaración titular o tercero (sección 3.2) | Aceptación guardada en cookie firmada o en la conversación del bot, sin datos del paciente, hasta verificar; al verificar se inserta `consent_records` con la fecha y hora de la aceptación que traen la cookie o la conversación, no la de la verificación (R-29); intención de carga exige autorización de salud con la versión vigente del texto (ADR 0012); `POST /revocations` exige `declarant` (ADR 0018) | Sin filas de dispositivo, chat ni paciente antes de la aceptación; `documents` exige por disparador una fila `consent_records` de tipo `health_data` para la huella del paciente; `consent_records.declarant NOT NULL`; `consent_records.accepted_at NOT NULL` y `CHECK accepted_at <= recorded_at` |
| 4. Telegram no prueba identidad | Toda consulta del bot pasa por `PatientAccessPolicy` con vinculación vigente; la vinculación solo nace de un código correcto | `channel_bindings` solo se inserta desde el caso de uso de verificación (sin otra ruta de escritura) |
| 5. Todo o nada por fórmula; resultado preliminar | El servicio de prevalidación marca no apta toda la fórmula si falla un medicamento; la respuesta siempre incluye `preliminary: true` y el aviso | `CHECK preliminary = true` en `prevalidation_results` |
| 6. Sin datos reales | Semilla validada; modo de mensajería limita destinatarios a la lista de contactos de prueba en vista previa (ADR 0009, 0013) | Esquema `sim` cargado solo desde `data/simulated` |
| 7. Panel autenticado y autorizado en el backend; denegar por defecto | Guard global con excepciones explícitas; prueba que falla si una ruta no declara su acceso (ADR 0016) | Consultas del dispensador filtradas por `point_id` en SQL |
| 8. Registros sin cédulas, diagnósticos ni medicamentos | Logger con lista blanca; filtro de excepciones sin mensajes del controlador; notas de la validación oficial y cuerpo crudo nunca registrados; registros de incumplimiento de recordatorios solo con tipo, resultado y retraso (ADR 0011, 0016) | `audit_events.details` con claves permitidas; huella HMAC en lugar de cédula en `consent_records` y `otp_challenges` |

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Solo validaciones en servicios | Más simple | Una consulta concurrente o un error de código rompe el invariante sin que nada lo detenga |
| Aislamiento `SERIALIZABLE` global | Garantía fuerte genérica | Más reintentos y errores de serialización en la reserva; los `CHECK` y bloqueos de fila son suficientes y más predecibles |

## Consecuencias
- Las violaciones de restricciones se traducen a errores 409 con información útil (por ejemplo, el mínimo permitido).
- QA prueba cada invariante también por la API directa, no solo por la interfaz.
