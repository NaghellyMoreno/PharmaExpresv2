# 0006. Código de un solo uso: generación, hash, vencimiento, intentos y límites

- **Estado:** Aceptada (2026-11-01). Longitud de 6 dígitos Confirmada por la usuaria (R-10). La decisión 6 es una decisión técnica nueva que cierra R-19.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** secciones 3.2 y 3.13 (punto 5); guía de agentes (architect, punto 2); HU-002, HU-003, HU-019 (criterio 11); RNF-010, RNF-032, RNF-033; F003 a F006, F040, F041, F092, F093; `docs/04-readiness.md` (R-10, R-19)

## Contexto
Confirmado: el código dura 10 minutos y admite 3 intentos; uno nuevo cada 2 minutos como mínimo, máximo 5 por cédula por hora, y cada nuevo anula el anterior; el código de revocación sigue las mismas reglas y cuenta en el mismo límite; el mensaje y la respuesta de la API no revelan si la cédula está afiliada; el código tiene 6 dígitos (usuaria, R-10).

## Decisión
1. **Generación:** 6 dígitos con `crypto.randomInt(0, 1_000_000)`, con ceros a la izquierda (Confirmado, R-10).
2. **Almacenamiento:** `otp_challenges.code_hash = HMAC-SHA-256(OTP_PEPPER, challengeId || código)`; nunca el código en claro. Comparación en tiempo constante.
3. **Identificación por huella:** la cédula nunca se guarda; se usa `cedula_fingerprint = HMAC-SHA-256(CEDULA_FINGERPRINT_KEY, cédula normalizada)` (HMAC Confirmado como "huella cifrada", R-24).
4. **Pedido (`POST /identity/otp-requests` y `POST /revocations/otp-requests`):** en una transacción con bloqueo por huella (`pg_advisory_xact_lock` sobre la huella):
   - Si hay un reto creado hace menos de 2 minutos para la huella (de cualquier propósito): 429 `code_too_soon` con `retryAfterSeconds`.
   - Si hay 5 retos en la última hora para la huella (sumando verificación y revocación): 429 `code_hourly_limit`.
   - Marca `superseded_at` en el reto vigente de la huella, sea del propósito que sea (decisión 6), e inserta uno nuevo con `expires_at = app.clock_now() + 10 min` (ADR 0021).
   - Si la cédula existe en `sim.affiliates`, genera el código; si no, el reto se guarda sin `code_hash` (nunca verificará).
   - Responde 202 con `challengeId` y el mensaje aprobado, idéntico en ambos casos. El envío por SMS y correo se hace después de responder (`waitUntil`), para que el tiempo de respuesta tampoco distinga.
   - Los límites aplican igual a cédulas inexistentes, para no revelar afiliación con el 429.
5. **Verificación:** incrementa `attempts_used` en la misma sentencia que compara (`UPDATE ... RETURNING`); `CHECK attempts_used <= 3`. Vencido, anulado o agotado: 410 con los tres caminos de salida (`nextSteps`). Incorrecto: 422 con intentos restantes. Correcto: `consumed_at` y continúa al caso de uso (vinculación o revocación).
6. **Un código nuevo anula el anterior de cualquier propósito (Decisión técnica, cierra R-19).** Hay como máximo un reto vigente por huella: índice único parcial sobre `cedula_fingerprint` donde `consumed_at IS NULL AND superseded_at IS NULL`. Motivo: la sección 3.13 (punto 5) dice "cada código nuevo anula el anterior" sin distinguir usos, y los dos propósitos ya comparten el límite de frecuencia. Así nunca hay dos códigos válidos a la vez para la misma cédula. Un reto `verify` sigue sin servir para revocar ni al revés (el propósito se comprueba al verificar).
7. **Limpieza:** los retos vencidos se borran en el despacho diario 24 horas después de vencer (Decisión técnica). Se conservan esas 24 horas porque el límite de 5 por hora los cuenta.

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| Un reto vigente por (huella, propósito) | Pedir un código de revocación no anula una verificación en curso | Dos códigos válidos a la vez; choca con la lectura literal de la sección 3.13 |
| Argon2 para el código | Más costoso de atacar | Innecesario: 3 intentos y 10 minutos acotan la fuerza bruta; HMAC con secreto evita ataques fuera de línea |
| Servicio de verificación del proveedor de SMS | Menos código | Ata la identidad a un proveedor; no cubre el correo; dificulta el mensaje único |
| Límites en memoria | Rápido | La función sin servidor no comparte memoria entre instancias |

## Consecuencias
- Guardar retos para cédulas inexistentes es un registro posterior a la aceptación del aviso (o, en la revocación, la excepción de la sección 3.2); no contiene la cédula.
- Si alguien pide un código de revocación mientras otra persona verifica la identidad de la misma cédula, el código de verificación queda anulado. Es coherente con "cada código nuevo anula el anterior" y con la confirmación de revocación al titular.
