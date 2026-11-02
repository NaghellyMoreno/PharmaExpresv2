# 0018. Revocación del consentimiento y eliminación de datos

- **Estado:** Aceptada (2026-11-01). La usuaria confirmó la declaración titular o tercero en la revocación (R-01) y el HMAC como huella cifrada (R-24); las demás propuestas quedaron aprobadas.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.1, 3.2, 3.3, 3.4 y 3.11; HU-001, HU-019 (criterios 5 y 16); RNF-003, RNF-007, RNF-028, RNF-032; F040, F041, F043, F092, F093, F100; `docs/04-readiness.md` (R-01, R-24); ADR 0012 (operaciones de Azure)

## Contexto
Confirmado (versión 7): "Revocar mi autorización" está en el inicio de la web y del bot, también sin vinculación o vencida; no exige aceptar el aviso; exige un código nuevo aunque haya vinculación; revoca quien lo supere; no crea vinculación; elimina de inmediato documentos, datos del OCR, prevalidaciones, solicitudes, citas, vinculaciones y recordatorios; cancela citas activas liberando cupo y medicamentos; conserva la prueba del consentimiento y de la revocación (fecha, canal, si fue el titular o un tercero y versión del aviso) ligada a una huella de la cédula con clave secreta (HMAC); **para dejar esa prueba, el flujo pide la declaración "Soy el titular" o "Actúo con su autorización"**; de cada cita cancelada o entregada queda solo punto, ventana, fecha y motivo; confirma por SMS y correo con el número de citas canceladas, sin medicamentos ni puntos; no modifica la EPS simulada. Es la única excepción a "si no acepta, no se registra nada".

## Decisión
1. `POST /revocations/otp-requests` (sin cookie de consentimiento) crea un reto de propósito `revoke` con las reglas del ADR 0006 y el mismo mensaje.
2. **Declaración (cierra R-01):** `POST /revocations` exige `challengeId`, `code` (6 dígitos) y `declarant` (`holder` = "Soy el titular", `third_party` = "Actúo con su autorización"). Sin `declarant` responde 400 y no consume intento. La web la pide con dos opciones en la pantalla P-10 antes de enviar el código; el bot, con dos botones guardados en la conversación (ADR 0008). La declaración no es una aceptación del aviso de privacidad (HU-019, criterio 12). En qué paso se pide la decide el diseño (Inferido en HU-019, criterio 16).
3. `POST /revocations`, si el código es correcto, en **una transacción**:
   1. Inserta `consent_records(kind='revocation', cedula_fingerprint, channel, notice_version, declarant)` con lo declarado en ese momento (no lo declarado al aceptar). `declarant` es `NOT NULL` en todos los tipos de registro.
   2. Si existe `patient_refs` para la huella: cancela citas activas con el orden de bloqueo del ADR 0005, liberando `window_slots` e `inventory_items`; copia a `appointment_archive` punto, inicio de ventana, fecha y motivo de cada cita cancelada o entregada (sin notas de validación oficial ni datos del paciente); lee las rutas de Blob y los `ocr_operation_id` abiertos de sus documentos; borra `patient_refs`, lo que borra en cascada vinculaciones, solicitudes, fórmulas, documentos, extracciones, prevalidaciones, citas, líneas, validaciones oficiales, tareas programadas del paciente y notificaciones pendientes.
   3. Inserta la notificación de confirmación (plantilla `revocation_confirmed` con `cancelledCount`) destinada solo a SMS y correo, con una referencia al afiliado simulado que se borra al enviarse.
4. **Después del commit:**
   - Borra los archivos de Blob (rutas leídas antes de borrar). Si falla, queda una tarea `blob_purge` con solo la ruta aleatoria del archivo.
   - Llama a "Delete Analyze Result" de Azure para cada operación abierta. Si falla, queda una tarea `ocr_result_purge` con solo el identificador de la operación. Las dos tareas no tienen paciente y las reintenta el despachador (ADR 0011). Si un análisis en curso termina después, el servicio de OCR no encuentra el documento y borra el resultado en Azure (ADR 0012).
5. No se crea `browser_devices` ni vinculación; en Telegram, si el chat no tenía fila, se crea solo la mínima para la conversación de revocación y se borra al terminar (Confirmado, propuesta aprobada).
6. No se envían notificaciones de cancelación por cita.
7. `consent_records` no tiene clave foránea al paciente; la huella es HMAC-SHA-256 con clave secreta (`CEDULA_FINGERPRINT_KEY`), no la cédula (Confirmado, R-24).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Tomar la declaración de la última aceptación del aviso | Un paso menos | La revocación no exige aceptar el aviso; no habría dato que tomar y la sección 3.2 pide la declaración en el flujo |
| Borrado lógico (marcar como revocado) | Reversible | Contradice "elimina de inmediato" |
| Borrado asíncrono total | Respuesta más rápida | Los datos seguirían disponibles un tiempo |
| Dejar que Azure borre solo a las 24 horas | Menos código | La sección 3.2 pide eliminar de inmediato los datos del OCR |

## Consecuencias
- Cerrados R-01 y R-24.
- Prueba RNF-028: revocar una vez como titular y otra como tercero; buscar en la base, tras revocar, la cédula, el nombre, documentos, diagnósticos y medicamentos del paciente de prueba; comprobar que la prueba registra lo declarado.
