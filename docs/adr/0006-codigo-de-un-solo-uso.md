# 0006. Código de un solo uso: generación, hash, vencimiento, intentos y límites

- **Estado:** Propuesta (longitud del código Pendiente)
- **Fecha:** 2026-10-31
- **Fuente:** secciones 3.2 y 3.13 (punto 5); guía de agentes (architect, punto 2); HU-002, HU-003, HU-019 (criterio 11); RNF-010, RNF-032; F003 a F006, F040, F041, F092, F093

## Contexto
Confirmado: el código dura 10 minutos y admite 3 intentos; uno nuevo cada 2 minutos como mínimo, máximo 5 por cédula por hora, y cada nuevo anula el anterior; el código de revocación sigue las mismas reglas y cuenta en el mismo límite; el mensaje y la respuesta de la API no revelan si la cédula está afiliada.

## Decisión
1. **Generación:** dígitos con `crypto.randomInt`. Longitud: **Pendiente**; propuesta de 6 dígitos (Inferido; el contexto no fija la longitud).
2. **Almacenamiento:** `otp_challenges.code_hash = HMAC-SHA-256(OTP_PEPPER, challengeId || código)`; nunca el código en claro. Comparación en tiempo constante.
3. **Identificación por huella:** la cédula nunca se guarda; se usa `cedula_fingerprint = HMAC-SHA-256(CEDULA_FINGERPRINT_KEY, cédula normalizada)`.
4. **Pedido (`POST /identity/otp-requests` y `POST /revocations/otp-requests`):** en una transacción con bloqueo por huella (`pg_advisory_xact_lock` sobre la huella):
   - Si hay un reto creado hace menos de 2 minutos para la huella: 429 con `retryAfterSeconds`.
   - Si hay 5 retos en la última hora para la huella (sumando verificación y revocación): 429.
   - Marca `superseded_at` en el reto vigente (anula el anterior) e inserta uno nuevo con `expires_at = now() + 10 min`.
   - Si la cédula existe en `sim.affiliates`, genera el código; si no, el reto se guarda sin `code_hash` (nunca verificará).
   - Responde 202 con `challengeId` y el mensaje aprobado, idéntico en ambos casos. El envío por SMS y correo se hace después de responder (`waitUntil`), para que el tiempo de respuesta tampoco distinga.
   - Los límites aplican igual a cédulas inexistentes, para no revelar afiliación con el 429.
5. **Verificación:** incrementa `attempts_used` en la misma sentencia que compara (`UPDATE ... RETURNING`); `CHECK attempts_used <= 3`. Vencido, anulado o agotado: 410 con los tres caminos de salida (`nextSteps`). Incorrecto: 422 con intentos restantes. Correcto: `consumed_at` y continúa al caso de uso (vinculación o revocación).
6. **Propósito separado:** un reto `verify` no sirve para revocar ni al revés.
7. **Limpieza:** retos vencidos se borran en el despacho diario (plazo Inferido: 24 horas).

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Argon2 para el código | Más costoso de atacar | Innecesario: 3 intentos y 10 minutos acotan la fuerza bruta; HMAC con secreto evita ataques fuera de línea |
| Servicio de verificación del proveedor de SMS | Menos código | Ata la identidad a un proveedor; no cubre el correo; dificulta el mensaje único |
| Límites en memoria | Rápido | La función sin servidor no comparte memoria entre instancias |

## Consecuencias
- Guardar retos para cédulas inexistentes es un registro posterior a la aceptación del aviso (o, en la revocación, la excepción de la sección 3.2); no contiene la cédula.
- Pendiente: longitud del código.
