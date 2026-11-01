# 0018. Revocación del consentimiento y eliminación de datos

- **Estado:** Propuesta
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.1, 3.2, 3.3 y 3.11; HU-001, HU-019; RNF-003, RNF-007, RNF-028, RNF-032; F040, F041, F043, F092, F093

## Contexto
Confirmado (versión 6): "Revocar mi autorización" está en el inicio de la web y del bot, también sin vinculación o vencida; no exige aceptar el aviso; exige un código nuevo aunque haya vinculación; revoca quien lo supere; no crea vinculación; elimina de inmediato documentos, OCR, prevalidaciones, solicitudes, citas, vinculaciones y recordatorios; cancela citas activas liberando cupo y medicamentos; conserva la prueba del consentimiento y de la revocación ligada a una huella cifrada de la cédula, y de cada cita cancelada o entregada solo punto, ventana, fecha y motivo; confirma por SMS y correo con el número de citas canceladas, sin medicamentos ni puntos; no modifica la EPS simulada. Es la única excepción a "si no acepta, no se registra nada". Esto prevalece sobre la redacción del invariante 3 de `CLAUDE.md`.

## Decisión
1. `POST /revocations/otp-requests` (sin cookie de consentimiento) crea un reto de propósito `revoke` con las reglas del ADR 0006 y el mismo mensaje.
2. `POST /revocations` con `challengeId` y código, en **una transacción**:
   1. Inserta `consent_records(kind='revocation', cedula_fingerprint, channel, notice_version, declarant=null)`.
   2. Si existe `patient_refs` para la huella: cancela citas activas liberando `window_slots` e `inventory_items` (ADR 0005); copia a `appointment_archive` punto, inicio de ventana, fecha y motivo de cada cita cancelada o entregada; borra `patient_refs`, lo que borra en cascada vinculaciones, solicitudes, fórmulas, documentos, extracciones, prevalidaciones, citas, líneas, tareas programadas y notificaciones pendientes.
   3. Inserta la notificación de confirmación (plantilla `revocation_confirmed` con `cancelledCount`) destinada solo a SMS y correo, con referencia al afiliado simulado que se borra al enviarse (Inferido).
3. **Después del commit:** borra los archivos de Blob (rutas leídas antes de borrar) de inmediato; si falla, queda una tarea de borrado con solo la ruta aleatoria del archivo, reintentada por el despachador.
4. No se crea `browser_devices` ni vinculación; en Telegram, si el chat no tenía fila, se crea solo la mínima para la conversación de revocación y se borra al terminar (Inferido).
5. No se envían notificaciones de cancelación por cita.
6. `consent_records` no tiene clave foránea al paciente; la huella es HMAC con clave secreta, no la cédula.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Borrado lógico (marcar como revocado) | Reversible | Contradice "elimina de inmediato" |
| Borrado asíncrono total | Respuesta más rápida | Los datos seguirían disponibles un tiempo |

## Consecuencias
- La sección 3.2 dice "huella cifrada"; HMAC es una huella con clave, no un cifrado reversible. Inferido que cumple la intención; confirmar con la usuaria.
- Prueba RNF-028: buscar en la base, tras revocar, la cédula, el nombre, documentos, diagnósticos y medicamentos del paciente de prueba.
