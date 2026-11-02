# 0019. Detalles de recuperación y enlaces del personal (preguntas P37 a P39)

- **Estado:** Aceptada (2026-11-01). La usuaria aprobó las tres propuestas; en P38, el reenvío también se permite antes de vencer.
- **Fecha:** 2026-10-31 (actualizada el 2026-11-01)
- **Fuente:** sección 3.12; brief (P37 a P39, resueltas); HU-033 (criterios 10 y 11), HU-036 (criterios 3 y 7); F072, F082 a F084; `docs/04-readiness.md` (R-12)

## Contexto
La sección 3.12 no precisaba cómo se cuenta el límite de recuperaciones, si el enlace de definición se puede reenviar antes de vencer, ni qué pasa con una cuenta desactivada que pide recuperar.

## Decisión (Confirmado, usuaria)
| Pregunta | Decisión | Diseño |
| --- | --- | --- |
| P37: ¿cómo se cuenta el límite de 3 solicitudes por hora? | Por correo ingresado (huella HMAC del correo normalizado con `EMAIL_FINGERPRINT_KEY`), exista o no la cuenta; al superarlo la respuesta es la misma y no se envía enlace | Tabla `password_reset_requests` por huella; `POST /staff/password-resets` siempre 202 con el mismo mensaje |
| P38: ¿reenviar el enlace de definición antes de que venza? | Sí, en cualquier momento mientras la cuenta no tenga contraseña definida; el nuevo anula el anterior | `POST /admin/dispensers/{id}/setup-links` responde 202 antes o después del vencimiento; si la cuenta ya tiene contraseña, 409 `password_already_set`. Ya no existe el código `setup_link_still_valid` |
| P39: ¿una cuenta desactivada puede recuperar? | No: misma respuesta en pantalla y no se envía enlace | El servicio no emite token si `active = false` |

## Alternativas consideradas
| Alternativa | A favor | En contra |
| --- | --- | --- |
| P37 por IP | Frena ataques masivos | Detrás de proxies comparte IP; no es lo que dice el contexto |
| P38 solo al vencer (lectura literal) | Literal | Un dispensador sin correo recibido espera hasta 48 h |
| P39 permitir y reactivar | Autoservicio | Anularía la desactivación del administrador |

## Consecuencias
- Cerrado R-12 en lo que toca a P37 a P39.
- Las solicitudes de recuperación y los reenvíos quedan en la auditoría (ADR 0016, decisión 9).
